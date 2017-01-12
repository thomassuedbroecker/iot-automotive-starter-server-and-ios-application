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
 * Routes to show UIs
 */
var uiRouter = module.exports = require('express').Router();
var authenticate = require('./auth.js').authenticate;

uiRouter.get('/ui/statistics', /* authenticate, */ function(req, res) {
	res.render("statistics", {});
});

uiRouter.get('/ui/trips', /* authenticate, */ function(req, res) {
	res.render("trips", {});
});

uiRouter.get('/ui/behaviors', /* authenticate, */ function(req, res) {
	res.render("behaviors", {"trip_uuid":"latest"});
});

uiRouter.get('/ui/behaviors/:trip_uuid', /* authenticate, */ function(req, res) {
	res.render("behaviors", {"trip_uuid":req.params.trip_uuid});
});

uiRouter.get('/ui/behaviorsmap', /* authenticate, */ function(req, res) {
	res.render("behaviorsmap", {"trip_uuid":"latest"});
});

uiRouter.get('/ui/behaviorsmap/:trip_uuid', /* authenticate, */ function(req, res) {
	res.render("behaviorsmap", {"trip_uuid":req.params.trip_uuid});
});

uiRouter.get('/ui/dashboard', /* authenticate, */ function(req, res) {
	res.render("dashboard", {});
});

uiRouter.get('/ui/listpage', /* authenticate, */ function(req, res) {
	res.render("listpage", {});
});

