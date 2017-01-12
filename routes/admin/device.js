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
var authenticate = require('./auth.js').authenticate;
var devices = require('../../devices/devices.js');
var debug = require('debug')('device');
debug.log = console.log.bind(console);

/**
 * get all devices
 */
router.get('/device', authenticate, function(req,res) {
	devices.getAllDevices().then(function(results) {
		res.send(results);
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

/**
 * get specific device's credentials. 
 * if the device has not been registered, register new device.
 */
router.get('/device/credentials/:typeId/:deviceId', authenticate, function(req,res) {
	devices.getCredentials(getDevice(req)).then(function(results) {
		res.send(results);
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

/**
 * get specific device's details
 */
router.get('/device/:typeId/:deviceId', authenticate, function(req,res) {
	devices.getDeviceDetails(getDevice(req)).then(function(results) {
		res.send(results);
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

/**
 * create new device
 */
router.post('/device', authenticate, function(req,res) {
	devices.createDevice(null, req.body).then(function(results) {
		res.status(201).send(results);
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

/**
 * create new device
 */
router.post('/device/:typeId', authenticate, function(req,res) {
	devices.createDevice(getDevice(req), req.body).then(function(results) {
		res.status(201).send(results);
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

/**
 * create new device
 */
router.post('/device/:typeId/:deviceId', authenticate, function(req,res) {
	devices.createDevice(getDevice(req), req.body).then(function(results) {
		res.status(201).send(results);
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

/**
 * update specific device's details
 */
router.put('/device/:typeId/:deviceId', authenticate, function(req,res) {
	devices.updateDevice(getDevice(req), req.body).then(function(results) {
		res.status(200).end();
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

/**
 * delete specific devices
 */
router['delete']('/device', authenticate, function(req,res) {
	devices.removeDevice(req.body.devices, true).then(function(results) {
		res.status(200).send(results);
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

/**
 * delete specific device
 */
router['delete']('/device/:typeId/:deviceId', authenticate, function(req,res) {
	devices.removeDevice(getDevice(req), true).then(function(results) {
		res.status(200).end();
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

function getDevice(req) {
	var deviceID = req.params.deviceId;
	var typeID = req.params.typeId;

	var device = {};
	if (deviceID && deviceID != '_') device.deviceID = deviceID;
	if (typeID && typeID != '_') device.typeID = typeID;
	return device;
}

/**
 * Show car details form
 */
router.get('/ui/device', function(req, res) {
	res.render('devicelist', {});
});

/**
 * Show car details form
 */
router.get('/ui/device/form', function(req, res) {
	res.render('deviceform', {});
});

