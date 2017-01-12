/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
/*
 * Implements admin utilities, qr-code generator and messages monitor.
 */
var router = require('express').Router();
var basicAuth = require('basic-auth');
var qr = require('qr-image');
var appEnv = require("cfenv").getAppEnv();

var ADMIN_USER     = process.env.ADMIN_USER || "ADMIN";
var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ADMIN";

//basic authentication
var authenticate = function(req,res,next){
	function unauthorized(res) {
		res.set('WWW-Authenticate', 'Basic realm=Authorization Required. Default apssword is ADMIN');
		return res.status(401).end();
	}
	var user = basicAuth(req);
	if (!user || !user.name || !user.pass) {
		return unauthorized(res);
	}
	if (user.name === ADMIN_USER && user.pass === ADMIN_PASSWORD) {
		return next();
	} else {
		return unauthorized(res);
	}
};

/**
 * Get the QR Code image for mobile app to connect to platform
 */
router.get('/qr/getPlatformCredentials', /*authenticate,*/ function(req, res) {
	var route = appEnv.url;
	var userVcapSvc = JSON.parse(process.env.USER_PROVIDED_VCAP_SERVICES || '{}');

	var imfpush = userVcapSvc.imfpush || VCAP_SERVICES.imfpush;
	var pushAppGuid = (imfpush && imfpush.length > 0 && imfpush[0].credentials && imfpush[0].credentials.appGuid) || "";
	var pushClientSecret = (imfpush && imfpush.length > 0 && imfpush[0].credentials && imfpush[0].credentials.clientSecret) || "";

	var mca = userVcapSvc.AdvancedMobileAccess || VCAP_SERVICES.AdvancedMobileAccess;
	var mcaTenantId = (mca && mca.length > 0 && mca[0].credentials && mca[0].credentials.tenantId) || "";

	var text = ["1", route, pushAppGuid, pushClientSecret, mcaTenantId].join(",");

	var img = qr.image(text, { type: 'png', ec_level: 'H', size: 3, margin: 0 });
	res.writeHead(200, {'Content-Type': 'image/png'})
	img.pipe(res);
});

router.get('/login', authenticate, function(req, res) {
	if(req.user){
		console.log(req.user);
		req.session.user = req.user;
	}
	else
		console.log("req.user is undefined");
	res.send({message: "authenticated", user: req.user});
});

router.get('/logout', function (req, res){
	if(req.user)
		delete req.user;
	req.logout();
	if(req.session)
		req.session.destroy(function (err) {
			return res.send("logged out");
		});
	else
		return res.send("logged out");
});

module.exports.router = router;
module.exports.authenticate = authenticate; // export the authentication router
