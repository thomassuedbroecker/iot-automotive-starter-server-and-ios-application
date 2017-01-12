/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var Q = new require('q');
var request = require("request");
var weatherCache = require("./weatherCache" + (process.env.WEATHER_CACHE || "").toUpperCase());
var debug = require('debug')('weatherInsights');
debug.log = console.log.bind(console);

var NEW_WEATHER_API = true; // Weather Company Data For IBM Bluemix since 7/1/2016


/**
 * module to access Insights for Weather API service
 * 
 * With WEATHER_CACHE environment variable, you can control which weather data cache is used
 * WEATHER_CACHE=demo : pre-defined demo data is used. Use WEATHER_DEMO_DATA environment variable to specified demo type (e.g. "data1", "data2"...)
 *                      Corresponding demo data under ./demo folder is loaded when it is specified.
 * WEATHER_CACHE=none : weatherInsights module does not cache weather data results.
 * Not Specified      : weatherInsights module uses cache for weather data results.
 * 
 */
var weatherInsights = {

	weatherInsightsConfig: function() {
		var userVcapSvc = JSON.parse(process.env.USER_PROVIDED_VCAP_SERVICES || '{}');
		var vcapSvc = VCAP_SERVICES.weatherinsights || userVcapSvc.weatherinsights;
		if (vcapSvc) {
			var weatherCreds = vcapSvc[0].credentials;
			var api = NEW_WEATHER_API ? "/api/weather/v1" : "/api/weather/v2";
			var hourlyForecastPeriods = NEW_WEATHER_API ? [48] : [24];
			var dailyForecastPeriods = NEW_WEATHER_API ? [3, 5, 7, 10] : [10];
			
			return {
				baseURL: weatherCreds.url + api,
				username : weatherCreds.username,
				password : weatherCreds.password,
				lang : "en-US",
				units : "m",
				hourlyForecastPeriods: hourlyForecastPeriods,
				dailyForecastPeriods : dailyForecastPeriods
			};
		}
		console.warn('Insights for Weather service is not bound.');
		return {};
	}(),
	
	/**
	 * Asynchronously get daily weather forecasts for the current day and the next required days 
	 * for given location(queryParam.latitude, queryParam.longitude).
	 * 
	 * @param queryParam 	query parameters for weather API
	 * {
	 * 		latitude: <latitude of location>
	 * 		longitude: <longitude of location>
	 * 		demomode: <OPTIONAL: data type to be loaded for demo data>
	 * }
	 */
	getDailyForecast: function(queryParam) {
		var currentTime = Math.floor(Date.now() / 1000);
		var requiredDays = Math.ceil((queryParam.etimeInSec - currentTime) / 60 / 60 / 24); // max required forecast days

		var days = 0;
		for (var i = 0; i < this.weatherInsightsConfig.dailyForecastPeriods.length; i++) {
			days = this.weatherInsightsConfig.dailyForecastPeriods[i];
			if (requiredDays <= days) {
				break;
			}
		}
		return this.getWeather('/forecast/daily/' + days + 'day', queryParam);
	},

	/**
	 * Asynchronously get hourly weather forecasts for the current hour and the next required hours 
	 * for given location(queryParam.latitude, queryParam.longitude).
	 * 
	 * @param queryParam 	query parameters for weather API
	 * {
	 * 		latitude: <latitude of location>
	 * 		longitude: <longitude of location>
	 * 		demomode: <OPTIONAL: data type to be loaded for demo data. e.g. data1, data2>
	 * }
	 */
	getHourlyForecast: function(queryParam) {
		var currentTime = Math.floor(Date.now() / 1000);
		var requiredHours = Math.ceil((queryParam.etimeInSec - currentTime) / 60 / 60); // max required forecast hours

		var hours = 0;
		for (var i = 0; i < this.weatherInsightsConfig.hourlyForecastPeriods.length; i++) {
			hours = this.weatherInsightsConfig.hourlyForecastPeriods[i];
			if (requiredHours <= hours) {
				break;
			}
		}
		return this.getWeather('/forecast/hourly/' + hours + 'hour', queryParam);
	},

	/**
	 * Asynchronously get the current weather observations for given location(queryParam.latitude, queryParam.longitude).
	 * 
	 * @param queryParam 	query parameters for weather API
	 * {
	 * 		latitude: <latitude of location>
	 * 		longitude: <longitude of location>
	 * 		demomode: <OPTIONAL: data type to be loaded for demo data. e.g. data1, data2>
	 * }
	 */
	getCurrentObservations: function(queryParam) {
		return this.getWeather(NEW_WEATHER_API ? '/observations' : '/observations/current', queryParam);
	},
	
	/**
	 * Asynchronously get weather forecasts for given location(queryParam.latitude, queryParam.longitude).
	 */
	getWeather: function(api, queryParam) {
		var data = weatherCache && weatherCache.getCacheData(api, queryParam);
		if (data) {
			return Q(data);
		}

		if (!this.weatherInsightsConfig.baseURL) {
			console.warn('Insights for Weather service is not available.');
			return Q({});
		}

		var options = this.makeOptions(api, queryParam);

		var deferred = Q.defer();
		console.info("calling weather API: " + options.url);
		debug("calling weather API: " + options.url);
		request(options, function (error, response, body) {
			if (!error) {
				var data = JSON.parse(body);
				if (weatherCache && response.statusCode == 200)
					weatherCache.pushCacheData(api, queryParam, data);
				deferred.resolve(data);
			} else {
				console.error('No weather forcast can not be retrieved. error=', error);
				deferred.reject(error);
			}
		});
		return deferred.promise;
	},
	
	makeOptions: function(api, queryParam) {
		if (NEW_WEATHER_API) {
			return {
				url: this.weatherInsightsConfig.baseURL + "/geocode/" + queryParam.latitude.toString() + "/" + queryParam.longitude.toString() + api + ".json" + 
					'?units=' + (queryParam.units || this.weatherInsightsConfig.units) + 
					'&language=' + (queryParam.lang || this.weatherInsightsConfig.lang),
				rejectUnauthorized: false
			};
		} else {
			return {
					url: this.weatherInsightsConfig.baseURL + api + 
						'?units=' + (queryParam.units || this.weatherInsightsConfig.units) + 
						'&geocode=' + (queryParam.latitude.toString() + ',' + queryParam.longitude.toString()) + 
						'&language=' + (queryParam.lang || this.weatherInsightsConfig.lang),
					rejectUnauthorized: false
			};
		}
	},
	
	/**
	 * Asynchronously get weather
	 * - returns array of per one or 12hour weather forecasts between sdatetime and edatetime. 
	 * If edatetime is after 48 hours from current time, it returns 12hour forecasts. If edatetime is within 48 hours from current time, it returns hourly forecasts.
	 * If range between sdatetime and edatetime is before current time or after 10 days, it returns empty array. 
	 * 
	 * @param queryParam 	query parameters for weather API
	 * {
	 * 		latitude: <latitude of location>
	 * 		longitude: <longitude of location>
	 *      stimeInSec: <Unix seconds to indicate the first date and time to query. the first value of returned array is a forecast that contains this time>
	 *      etimeInSec: <Unix seconds to indicate the last date and time to query. the last value of returned array is a forecast that contains this time>
	 * 		demomode: <OPTIONAL: data type to be loaded for demo data>
	 * }
	 */
	getForecastsInRange: function(queryParam) {
		if (!queryParam || isNaN(queryParam.etimeInSec)) {
			console.error("invalid end time");
			return Q.resolve([]);
		}
		
		var currentTime = Math.floor(Date.now() / 1000);
		var maxHours = this.weatherInsightsConfig.hourlyForecastPeriods[this.weatherInsightsConfig.hourlyForecastPeriods.length-1];
		var hourlyLimitInSec = maxHours * 60 * 60;
		if (queryParam.etimeInSec - currentTime <= hourlyLimitInSec) {
			return weatherInsights.getHourlyForecastsInRange(queryParam);
		} else {
			return weatherInsights.getDailyForecastsInRange(queryParam);
		}
	},
	
	/**
	 * Asynchronously get weather
	 * - returns array of 12hour weather forecasts between sdatetime and edatetime
	 * 
	 * @param queryParam 	query parameters for weather API
	 * {
	 * 		latitude: <latitude of location>
	 * 		longitude: <longitude of location>
	 *      stimeInSec: <Unix seconds to indicate the first date and time to query. the first value of returned array is a forecast that contains this time>
	 *      etimeInSec: <Unix seconds to indicate the last date and time to query. the last value of returned array is a forecast that contains this time>
	 * 		demomode: <OPTIONAL: data type to be loaded for demo data>
	 * }
	 */
	getDailyForecastsInRange: function(queryParam) {
		return weatherInsights.getDailyForecast(queryParam).then(function(result) {
			if (!result.forecasts || result.forecasts.length == 0) {
				console.warn('No weather forcast can not be retrieved.');
				return [];
			}

			// function to check if given forecast is in range or not
			var end = result.forecasts[result.forecasts.length - 1];
			var range = weatherInsights._normalize(queryParam.stimeInSec, result.forecasts[0].fcst_valid, 
													queryParam.etimeInSec, end.night ? end.night.fcst_valid : end.day.fcst_valid);
			var rangeSec = 12 * 60 * 60; // 12-hour in sec
			var isInRange = function(forecast) {
				return forecast && (range.s < forecast.fcst_valid + rangeSec) && (forecast.fcst_valid <= range.e);
			};
			
			// collect weather forecasts in range
			var weatherResult = [];
			result.forecasts.forEach(function(forecast, index) {
				if (isInRange(forecast.day))
					weatherResult.push(forecast.day);
				if (isInRange(forecast.night))
					weatherResult.push(forecast.night);
			});
			return weatherResult;
		});
	},
	

	/**
	 * Asynchronously get weather
	 * - returns array of hourly weather forecasts between stimeInSec and etimeInSec
	 * 
	 * @param queryParam 	query parameters for weather API
	 * {
	 * 		latitude: <latitude of location>
	 * 		longitude: <longitude of location>
	 *      stimeInSec: <Unix seconds to indicate the first date and time to query. the first value of returned array is a forecast that contains this time>
	 *      etimeInSec: <Unix seconds to indicate the last date and time to query. the last value of returned array is a forecast that contains this time>
	 * 		demomode: <OPTIONAL: data type to be loaded for demo data>
	 * }
	 */
	getHourlyForecastsInRange: function(queryParam) {
		return weatherInsights.getHourlyForecast(queryParam).then(function(result) {
			if (!result.forecasts || result.forecasts.length == 0) {
				console.warn('No weather forcast can not be retrieved.');
				return [];
			}

			// function to check if given forecast is in range or not
			var range = weatherInsights._normalize(queryParam.stimeInSec, result.forecasts[0].fcst_valid, 
													queryParam.etimeInSec, result.forecasts[result.forecasts.length - 1].fcst_valid);
			var rangeSec = 60 * 60; // 1 hour in sec
			var isInRange = function(forecast) {
				return forecast && (range.s < forecast.fcst_valid + rangeSec) && (forecast.fcst_valid <= range.e);
			};

			// collect weather forecasts in range
			var weatherResult = [];
			result.forecasts.some(function(forecast, index) {
				if (isInRange(forecast))
					weatherResult.push(forecast);
			});
			return weatherResult;
		});
	},
	
	_normalize: function(startUtcTimeInSec, minSec, endUtcTimeInSec, maxSec) {
		var endUtcTimeInSec = isNaN(endUtcTimeInSec) ? startUtcTimeInSec : endUtcTimeInSec;
		if (startUtcTimeInSec > endUtcTimeInSec) {
			var time = endUtcTimeInSec;
			endUtcTimeInSec = startUtcTimeInSec;
			startUtcTimeInSec = time;
		}

		if (minSec >= 0 &&  startUtcTimeInSec < minSec)
			startUtcTimeInSec = minSec;
		if (maxSec >= 0 &&  endUtcTimeInSec > maxSec)
			endUtcTimeInSec = maxSec;

		return {s: startUtcTimeInSec, e: endUtcTimeInSec};
	}
}

module.exports = weatherInsights;
