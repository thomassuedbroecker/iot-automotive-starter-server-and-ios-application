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
 * REST apis for car devices
 */
var router = module.exports = require('express').Router();
var devices = require('../../devices/devices.js');
var debug = require('debug')('device');
debug.log = console.log.bind(console);

/**
 * get all devices
 */
router.get('/device', /*authenticate, */function(req,res) {
	var options = {sortBy: req.query.sortBy, page: req.query.page, pageUnit: req.query.pageUnit};
	devices.getAllDevices(options).then(function(results) {
		res.send(results);
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});
