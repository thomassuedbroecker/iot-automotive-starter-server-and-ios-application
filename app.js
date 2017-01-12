/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var express = require('express');
var http = require('http');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var cors = require('cors');
var helmet = require('helmet');
var appEnv = require('cfenv').getAppEnv();
var appVersion = require("./package.json").version; // This application assumes that package.json is existing and contains version number

//Deployment tracker code snippet
require("cf-deployment-tracker-client").track();
/*
 * Define useful global variables and functions shared in this application
 */
//global BM_APPLICATION_ID
BM_APPLICATION_ID = appEnv.app.application_id || process.env.USER_PROVIDED_BM_APPLICATION_ID;
if(!BM_APPLICATION_ID)
	throw new Error('application_id must be provided either cfenv or USER_PROVIDED_BM_APPLICATION_ID');

//global USER_PROVIDED VCAP_SERVICES contains additional vcap_services
USER_PROVIDED_VCAP_SERVICES = JSON.parse(process.env.USER_PROVIDED_VCAP_SERVICES || '{}');

//There are many useful environment variables available in process.env.
//global VCAP_APPLICATION contains useful information about a deployed application.
VCAP_APPLICATION = JSON.parse(process.env.VCAP_APPLICATION || '{}');
//global VCAP_SERVICES contains all the credentials of services bound to
//this application. For details of its content, please refer to
//the document or sample of each service.
VCAP_SERVICES = JSON.parse(process.env.VCAP_SERVICES || '{}')

/*
 * List DEMO-related user defined environment variables
 */
// true not to use simulated car devices
//DISABLE_DEMO_CAR_DEVICES = process.env.DISABLE_DEMO_CAR_DEVICES // _app.js
// false to skip MCA authentication and act as "demo user" 
//MCA_AUTHENTICATION = process.env.MCA_AUTHENTICATION // routes/user/auth.js


//global error handling function to dumpError referred by device simulation engine.
dumpError = function(msg, err) {
	if (typeof err === 'object') {
		msg = (msg) ? msg : '';
		var message = '***********ERROR: ' + msg + ' *************\n';
		if (err.message) {
			message += '\nMessage: ' + err.message;
		}
		if (err.stack) {
			message += '\nStacktrace:\n';
			message += '====================\n';
			message += err.stack;
			message += '====================\n';
		}
		console.error(message);
	} else {
		console.error('dumpError :: argument is not an object');
	}
};

//if you are debugging on a local machine then edit _debug.js and add/override services credentials
//require("_debug.js");

/*
 * Create express application
 */
var app = express();
//set the app object to export so it can be required
module.exports = app;

/*
 * Initialize IoT libraries
 */
require('./watsonIoT');    //load Watson IOT platform client
require('./workbenchLib'); //load workbench library modules

/*
 * Configure the express app
 */
//Get port from environment and store in Express.
var port = process.env.VCAP_APP_PORT || appEnv.port;
app.set('port', port);
//Create HTTP server.
app.server = http.createServer(app);
//trust bluemix proxy
app.enable('trust proxy');
//use ejs as views engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
//app.use(favicon(__dirname + '/public/favicon.ico')); //TODO uncomment after placing your favicon in /public
//request parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
//logging http requests
app.use(logger('dev'));
//security
app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.disable('x-powered-by');
//allow cross domain ajax requests
app.use(cors());
//force https for all requests
app.use(function (req, res, next) {
	res.set({
		'Cache-Control': 'no-store',
		'Pragma': 'no-cache'
	});
	if(req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] === 'http'){
		res.redirect('https://' + req.headers.host + req.url);
	} else{
		next();
	}
});

//static serve 'public' folder
app.use(express.static(path.join(__dirname, 'public'), {extensions: ['html', 'htm']}));

//test referer
app.use(function(req, res, next){
	var referrer = req.headers['referer'];
	if(!referrer){
//		console.error('accepted due to no referrer');
		return next();
	}
	
	referrer = referrer.toLowerCase();
	for(var i=0; i<appEnv.urls.length; i++){
		var url = appEnv.urls[i].toLowerCase();
		if(referrer.indexOf(url, 0) === 0)
//			console.error('accepted as the server name matched');
			return next(); // accept
	}
	
	if(req.method === 'GET' && req.path){
		// allow link to the top page
		if(req.path === '/') return next();
		if(req.path === '/top') return next();
		// allow direct link to images, esp. QR code
		if(req.path.startsWith('/admin/qr/')) return next();
	}
	
	//reject
	console.error('Rejected request as the referrer [%s] does not match to any server URLs.', referrer);
	res.status(403).send('Unauthorized');
});

// add version
app.use(function(req, res, next){
	res.setHeader("iota-starter-car-sharing-version", appVersion);
	next();
});

//add routes
app.use('/',           require('./routes/indexRouter.js'));
app.use('/admin',      require('./routes/admin'));
app.use('/user',       require('./routes/user'));
app.use('/apps',       require('./routes/customIdentityProviderRouter.js'));
app.use('/monitoring', require('./routes/monitoring'));
app.use('/api',        require('./devicesSimulationEngine/api.js'));

//catch 404 and forward to error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

//error handlers

//development error handler
//will print stacktrace
if (app.get('env') === 'development') {
	app.use(function(err, req, res, next) {
		console.error(err);
		res.status(err.status || 500);
		res.render('error', {
			message: err.message,
			error: err
		});
	});
}

//production error handler
//no stacktraces leaked to user
app.use(function(err, req, res, next) {
	console.error(err);
	res.status(err.status || 500);
	res.render('error', {
		message: err.message,
		error: {}
	});
});

/**
 * Listen on provided port, on all network interfaces.
 */
var onError,onListening;
app.server.on('error', onError);
app.server.on('listening', onListening);
app.server.listen(port);
/**
 * Event listener for HTTP server "error" event.
 */
function onError(error) {
	if (error.syscall !== 'listen') {
		throw error;
	}

	var bind = typeof port === 'string' ?
			'Pipe ' + port
			: 'Port ' + port;

	// handle specific listen errors with friendly messages
	switch (error.code) {
	case 'EACCES':
		console.error(bind + ' requires elevated privileges');
		process.exit(1);
		break;
	case 'EADDRINUSE':
		console.error(bind + ' is already in use');
		process.exit(1);
		break;
	default:
		throw error;
	}
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening() {
	var addr = app.server.address();
	var bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
	console.log('Server listening on ' + bind);
	
	// start DEMO-related activities
	require("./_app.js");
}
