let request = require("request");
let moment = require("moment");

const createRequest = (input, callback) => {
	let url = "https://us-beta.market-api.kaiko.io/v1/data/trades.v1/exchanges/";
	const exchange = input.data.exchange || "";
	const instrument = input.data.instrument || "";
	url = url + exchange + "/spot/" + instrument + "/aggregations/vwap"
	let queryObj = {
		start_time: input.data.start_time,
		end_time: input.data.end_time
	}
	for (let key in queryObj) {
        if (typeof queryObj[key] === "undefined") {
            delete queryObj[key];
        } else {
			queryObj[key] = moment.unix(queryObj[key]).utc().format();
		}
	}
	const headerObj = {
		"X-Api-Key": process.env.API_KEY,
		"User-Agent": "Chainlink"
	}
	const options = {
		url: url,
		qs: queryObj,
		headers: headerObj,
		json: true
	}
	request(options, (error, response, body) => {
		if (error || response.statusCode >= 400) {
			callback(response.statusCode, {
				jobRunID: input.id,
				status: "errored",
				error: body
			});
		} else {
			callback(response.statusCode, {
				jobRunID: input.id,
				data: body
			});
		}
	});
};

exports.gcpservice = (req, res) => {
	createRequest(req.body, (statusCode, data) => {
		res.status(statusCode).send(data);
	});
};

exports.handler = (event, context, callback) => {
	createRequest(event, (statusCode, data) => {
		callback(null, data);
	});
}

module.exports.createRequest = createRequest;