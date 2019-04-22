var poster = require('./post-update.js');
var db = initDb();
var debug = false;
var pollIntervalSeconds = process.env.POLL_TIME;

function initDb() {
	return require('redis').createClient(process.env.REDIS_URL);
}


function checkAppStatus() {
	console.log("Fetching latest app status...")

	// invoke ruby script to grab latest app status
	var exec = require("child_process").exec;
	exec('ruby get-app-status.rb', function (err, stdout, stderr) {
		if (stdout) {
			// compare new app info with last one (from database)
			console.log(stdout);
			var versions = JSON.parse(stdout);

			for(let version of versions) {
				_checkAppStatus(version);
			}
		}
		else {
			console.log("There was a problem fetching the status of the app!");
			console.log(stderr);
		}
	});
}

function _checkAppStatus(version) {
	// use the live version if edit version is unavailable
	var currentAppInfo = version["editVersion"] ? version["editVersion"] : version["liveVersion"];

	var appInfoKey = 'appInfo-' + currentAppInfo.appId;

	db.get(appInfoKey, function(err, data){
		if (err) {
			console.log(err);
			return;
		}

		let lastAppInfo = JSON.parse(data);

		if (!data) {
			sendSlack(currentAppInfo);
		} else if (lastAppInfo.status != currentAppInfo.status || debug) {
			sendSlack(currentAppInfo);
		}else if (currentAppInfo) {
			console.log(`Current status \"${currentAppInfo.status}\" matches previous status. AppName: \"${currentAppInfo.name}\"`);
		} else {
			console.log("Could not fetch app status");
		}

		// store latest app info in database
		db.set(appInfoKey, currentAppInfo.toString(), function(){});

	});

}

function sendSlack(currentAppInfo) {
	// PINTORを外す
	if(currentAppInfo.appId == 1284698988) {
		return;
	}


	var submissionStartkey = 'submissionStart' + currentAppInfo.appId;

	let preDateString = db.get(submissionStartkey);
	poster.slack(currentAppInfo, new Date(preDateString));

	// store submission start time`
	if (currentAppInfo.status == "Waiting For Review") {
		let now = new Date();
		db.set(submissionStartkey, now.toString(), function(){});
	}
}


if(!pollIntervalSeconds) {
	pollIntervalSeconds = 60 * 2;
}

setInterval(checkAppStatus, pollIntervalSeconds * 1000);
checkAppStatus();
