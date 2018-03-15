/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var watson = require('watson-developer-cloud'); // watson sdk

var app = express();

const Promise = require('bluebird');
const seeThroughNy = require('./seeThroughNy.js');

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper

var conversation = new watson.ConversationV1({
  // If unspecified here, the CONVERSATION_USERNAME and CONVERSATION_PASSWORD env properties will be checked
  // After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property
  username: process.env.CONVERSATION_USERNAME || '<username>',
  password: process.env.CONVERSATION_PASSWORD || '<password>',
  version_date: '2018-02-16'
});

var conversationMessageAsync = Promise.promisify(conversation.message.bind(conversation))

// Endpoint to be call from the client side
app.post('/api/message', function (req, res) {
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }
  var payload = {
    workspace_id: workspace,
    context: req.body.context || {},
    input: req.body.input || {}
  };

  // Send the input to the conversation service
  conversationMessageAsync(payload)
    .then(data => updateMessage(payload, data))
    .then(response => res.json(response))
    .catch(e => {
      console.error(e);
      res.status(e.code || 500).json(e)
    })
});

/**
 * Updates the response text using the intent confidence
 * @param  {Object} input The request to the Conversation service
 * @param  {Object} response The response from the Conversation service
 * @return {Object}          The response with the updated message
 */
function updateMessage(input, response) {
  response.output = response.output || {};
  var actions = response.actions || [];

  var searchIndividualActions = actions.filter(a => a.name == 'searchIndividual');
  if (searchIndividualActions.length) {
    var searchIndividualAction = searchIndividualActions[0];
    console.log("***info*** requested individual information")
    // call external service here
    // fill personData with proper context vars
    let name = response.context.person;
    if (!name.match(/,/)) {
      let nameArr = name.split(' ');
      name = nameArr[nameArr.length - 1] + ", " + nameArr.slice(0, nameArr.length - 1).join(" ")
    }
    console.log(response)
    var agency  = response.context.agency;
    var branch = response.context.branch;
    var position = response.context.position;
    var subagency = response.context.subagency;
    if (subagency && subagency.match('SUNY')){
      agency = 'SUNY';
    }

    let personData = {
      AgencyName: [agency],
      BranchName: [branch],
      PayYear: ["2017"],
      PositionName: [position],
      SortBy: "YTDPay DESC",
      SubAgencyName: [subagency],
      WholeName: name,
      YTDPay: {}
    }
    let newPayload = {};
    return seeThroughNy.getPersonSalary(personData)
      .then(personSalariesArr => {
        // check length of array and filter based on what they asked
        // if it is empty then that name was not found
        response.context.count = personSalariesArr.length;
        if (personSalariesArr.length == 1) {
          // var categories = {
          //   "subagency": "[]",
          //   "position": "[]",
          //   "payRate": "[]",
          //   "payYear": "[]",
          //   "payBasis": "[]",
          //   "branch": "[]",
          //   "name": "[]",
          //   "agency": "[]",
          //   "totalPay": "[]"
          // }
          var foundPerson = personSalariesArr[0];
          response.context[searchIndividualAction.result_variable] = foundPerson;
          response.context.position = foundPerson.position;
          response.context.subagency = foundPerson.subagency;
          response.context.agency = foundPerson.agency;
          response.context.salary = parseInt(foundPerson.payRate.replace(/\$|,/g, ''));
          response.context.branch = foundPerson.branch;
        }

        // hit watson service again here to continue to next node
        newPayload = {
          workspace_id: input.workspace_id,
          context: response.context,
          output: response.output,
          intents: response.intents,
          entities: response.entities
        };
        return conversationMessageAsync(newPayload)
      })
      .then(data => updateMessage(newPayload, data))

  }


  if (response.output.action == 'clearPerson'){
    let myName = response.context.myName;
    response.context = {
      myName: myName
    };
  }
  // console.log(response)
  return Promise.resolve(response);
}

module.exports = app;