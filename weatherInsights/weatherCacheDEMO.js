/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var _ = require("underscore");
var fs = require('fs-extra');

/**
 * Weather cache for demo. Weather data under ./demo folder is always used instead of getting through API
 * Data type is specified with one of the following paths.
 * 
 * 1. by param value, param.demodata
 * 2. by environment value WEATHER_DEMO_DATA
 * 3. otherwise, "rainy" by default
 * 
 */
var weatherCacheDEMO = {
	weatherCacheConfig : function() {
		return {
			cacheMap : {},
			data: process.env.WEATHER_DEMO_DATA
		};
	}(),

	getCacheData : function(api, param) {
		var weatherData = null;
		var dataType = param.demomode || this.weatherCacheConfig.data || 'rainy';
		var cacheKey = dataType + api;
		console.log("weather demo : " + cacheKey);
		if (this.weatherCacheConfig.cacheMap[cacheKey]) {
			weatherData = this.weatherCacheConfig.cacheMap[cacheKey];
		} else {
			try {
				weatherData = fs.readJsonSync('./weatherInsights/demo/' + dataType + api + '.json');
				this.weatherCacheConfig.cacheMap[cacheKey] = weatherData;
			} catch (e) {
				console.error('Caught error: ', e);
				return {};
			}
		}
		return this.adjustData(weatherData, param, api);
	},
	
	pushCacheData : function(api, param, data) {
	},
	
	clearCacheData : function() {
		this.weatherCacheConfig.cacheMap = {};
	},
	
	adjustData: function(data, param, api) {
		var daily = api.lastIndexOf('day') >= 0;
		var hourly = api.lastIndexOf('hour') >= 0;
		var d = _.clone(data);

		var offset = 0;
		var currentTime = Math.floor(Date.now()/1000);
		if (d.forecasts) {
			if (daily) {
				var c = new Date();
				var date = new Date(c.getFullYear(), c.getMonth(), c.getDate(), 7, 0, 0, 0);
				currentTime = Math.floor(date.getTime()/1000);
			} else if (hourly) {
				var c = new Date();
				var date = new Date(c.getFullYear(), c.getMonth(), c.getDate(), c.getHours(), 0, 0, 0);
				currentTime = Math.floor(date.getTime()/1000);
			}
			console.log("adjust the first weather record to " + new Date(currentTime*1000).toLocaleString());
			offset = currentTime - d.forecasts[0].fcst_valid;
			d.forecasts.forEach(function(forecast, index) {
				this.adjustWeatherTime(forecast, offset);
			}, this);
		} else if (d.observations) {
			offset = currentTime - d.observations[d.observations.length-1].valid_time_gmt;
			d.observations.forEach(function(observation, index) {
				this.adjustWeatherTime(observation, offset);
			}, this);
		} else if (d.observation) {
			offset = currentTime - d.observation.obs_time;
			this.adjustWeatherTime(d.observation, offset);
		}

		d.metadata.expire_time_gmt += offset;
		d.metadata.latitude = param.latitude;
		d.metadata.longitude = param.longitude;
		return d;
	},
	
	adjustWeatherTime: function(data, offset) {
		if (data.expire_time_gmt) {
			data.expire_time_gmt += offset;
		}
		if (data.fcst_valid) {
			data.fcst_valid += offset;
		}
		if (data.fcst_valid_local) {
			data.fcst_valid_local = new Date(data.fcst_valid*1000).toISOString();
		}
		if (data.valid_time_gmt) {
			data.valid_time_gmt += offset;
		}
		if (data.obs_time) {
			data.obs_time += offset;
		} 
		if (data.obs_time_local) {
			data.obs_time_local = new Date(data.obs_time*1000).toISOString();
		} 
		if (data.day) {
			data.day.fcst_valid += offset;
			data.day.expire_time_gmt += offset;
		}
		if (data.night) {
			data.night.fcst_valid += offset;
			data.night.expire_time_gmt += offset;
		}
	}
}

module.exports = weatherCacheDEMO;
