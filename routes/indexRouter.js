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
 * Implements redicrects to the root access
 */
var indexRouter = module.exports = require('express').Router();
var appEnv = require("cfenv").getAppEnv();

/*
 * Implementation for redirecting top page
 */
var TOP_PAGE_REDIRECT_URL = process.env['TOP_PAGE_REDIRECT_URL'];
var TOP_PAGE_REDIRECT_EXEMPTION_URL = process.env['TOP_PAGE_REDIRECT_EXEMPTION_URL'] || TOP_PAGE_REDIRECT_URL;

indexRouter.get(['/', '/top'], function(req, res) {
	if(TOP_PAGE_REDIRECT_URL){
		var referer = req.headers['referer'];
		if(!referer || !referer.startsWith(TOP_PAGE_REDIRECT_EXEMPTION_URL)){
			return res.render('redirect', { url: TOP_PAGE_REDIRECT_URL });
		}
	}
	res.redirect('/monitoring');
});

indexRouter.get('/debug', function(req, res) {
	res.render('indexDebug', { appName: appEnv.name });
});
