/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var router = module.exports = require('express').Router();
var jsonParser = require('body-parser').json();

// user repository
var userRepository = {
	// users are added as below
	// "tom":  { password: "tom" , displayName: "Tom" , dob:"Janualy 1, 2016"}
}

router.post('/:tenantId/:realmName/startAuthorization', jsonParser, function(req, res){
	var tenantId = req.params.tenantId;
	var realmName = req.params.realmName;
	var headers = req.body.headers;

	console.log("startAuthorization", tenantId, realmName, headers);

	var responseJson = {
		status: "challenge",
		challenge: {
			text: "Enter username and password."
		}
	};

	res.status(200).json(responseJson);
});

router.post('/:tenantId/:realmName/handleChallengeAnswer', jsonParser, function(req, res){
	var tenantId = req.params.tenantId;
	var realmName = req.params.realmName;
	var challengeAnswer = req.body.challengeAnswer;


	console.log("handleChallengeAnswer", tenantId, realmName, challengeAnswer);

	var username = req.body.challengeAnswer["username"];
	var password = req.body.challengeAnswer["password"];

	var responseJson = { status: "failure" };

    // add a new user when the username does not exist in user repository except ""
    if (username != "" && userRepository[username] == null) {
        userRepository[username]={password: password, displayName: username, dob:"Janualy 1, 2016"};
        console.log("A new userId is added ::", username);
    }

	var userObject = userRepository[username];
	if (userObject && userObject.password == password ){
		console.log("Login success for userId ::", username);
		responseJson.status = "success";
		responseJson.userIdentity = {
			userName: username,
			displayName: userObject.displayName,
			attributes: {
				dob: userObject.dob
			}
		}
	} else {
		console.log("Login failure for userId ::", username);
		var responseJson = {
			status: "challenge",
			challenge: {
				text: "Login failed. Re-enter username and password."
			}
		};
	}

	res.status(200).json(responseJson);
});
