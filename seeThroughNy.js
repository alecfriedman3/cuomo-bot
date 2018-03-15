const request = require('request-promise');
const cheerio = require('cheerio');

function getPersonSalary(personData) {
    
    let options = {
        method: 'POST',
        url: 'http://seethroughny.net/tools/required/reports/payroll?action=get',
        headers: {
            'Referer': 'http://seethroughny.net/payrolls',
        },
        form: personData,
        json: true,
        transform: (data) => {
            data.html = "<table>" + data.html + "</table>"
            return cheerio.load(data.html)
        }
    };
    return request.post(options)
    .then($ => {
        let data = {};
        $('tr').each(function(i){
            let $this = $(this);
            let id = $this.attr('id');
            let uniqueKey = id.replace(/resultRow|expandRow/, '')
            if (id.match(/resultRow/)){
                let vals = $this.find('td');
                data[uniqueKey] = {
                    name: $(vals[1]).text(),
                    agency: $(vals[2]).text(),
                    totalPay: $(vals[3]).text()
                }
            } else {
                let vals = $this.find('.col-xs-6');
                let moreData = {
                    subagency: $(vals[0]).text(),
                    position: $(vals[1]).text(),
                    payRate: $(vals[2]).text(),
                    payYear: $(vals[3]).text(),
                    payBasis: $(vals[4]).text(),
                    branch: $(vals[5]).text(),
                }
                data[uniqueKey] = Object.assign(moreData, data[uniqueKey])
            }
        })
        return Object.values(data);
    })
}

module.exports = {
    getPersonSalary: getPersonSalary
}