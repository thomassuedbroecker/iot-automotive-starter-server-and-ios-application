/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var Q = require('q');
var _ = require('underscore');
var weatherInsights = require('../../../weatherInsights/weatherInsights.js');

var weatherRecommendedRateRule = {
		// hardcoded rule
		recommendationConfig : function() {
			return {
				category: "weatherInsights",
				devicerules: [{
					prop: "model/type",
					operator: "EQ",
		        	value: "Convertible", 
		        	forecastrules: [{
        	            prop: "qpf", 
        	            operator: "GT", 
        	            value: 0, 
        	            rate: 0.8, 
        	            shortText: "rain", 
        	            longText: "Convertible is not suitable for rain."
        	        }]
			    },{
					prop: "model/drive",
					operator: "EQ",
		        	value: "AWD", 
		        	forecastrules: [{
    	            	prop: "snow_qpf", 
        	            operator: "GT", 
        	            value: 0, 
        	            rate: 1.2, 
        	            shortText: "snow", 
        	            longText: "AWD car is good for snow."
        	        }]
			    },{
					prop: "model/drive",
					operator: "EQ",
		        	value: "FR", 
		        	forecastrules: [{
    	            	prop: "snow_qpf", 
        	            operator: "GT", 
        	            value: 0, 
        	            rate: 0.6, 
        	            shortText: "snow", 
        	            longText: "FR layout is not suitable for snow."
        	        }]
			    }]
			};
		}(),
		
		getRecommendationForcast: function(forecasts) {
			if (!forecasts || forecasts.length === 0)
				return null;
			return forecasts[forecasts.length-1]; // use the most close forecast to drop-off time
		},
		
		precalcRecommendedRate: function(filters) {
			var self = this;
			return weatherInsights.getForecastsInRange(filters).then(function(forecasts) {
				if (forecasts && forecasts.length > 0) {
					var forecast = self.getRecommendationForcast(forecasts);
					if (forecast) {
						var weather = "weather for recommendation: " + new Date(forecast.fcst_valid*1000).toLocaleString() + "(" + forecast.fcst_valid +
										") : qpf = " + forecast.qpf + ", snow_qpf = " + forecast.snow_qpf;
						console.log(weather);
					} else {
						console.log("There is no target weather forecast for recommendation.");
					}
				}
				return forecasts;
			});
		},
		
		calcRecommendedRate : function(deviceDetails, filters, forcasts) {
			return Q(this.applyRules(deviceDetails, forcasts));
		},
		
		applyRules: function(deviceDetails, forecasts) {
			var rate = {rate: 1.0, causes: []};
			var forecast = this.getRecommendationForcast(forecasts);
			if (!forecast)
				return rate;
			
			var category = this.recommendationConfig.category;
			
			this.getActiveRules(this.recommendationConfig.devicerules, deviceDetails).forEach(function(devicerule) {
				this.getActiveRules(devicerule.forecastrules, forecast).forEach(function(forecastrule, index) {
					// multiply the total rate by a rate in specific rule
					rate.rate *= forecastrule.rate;
					rate.causes.push({category:category, shortText:forecastrule.shortText, longText:forecastrule.longText});
				}, this);
			}, this);
			return rate;
		},

		/**
		 * collect device rules that can be applied to given properties (deviceDetails or forecast) 
		 */
		getActiveRules: function(rules, properties) {
			return _.filter(rules, function(rule) {
				var val = null;
				if (rule.prop) {
					val = properties;
					rule.prop.split('/').forEach(function(p, index) {
						if (val) val = val[p];
					});
				}
				return val && this.evaluateRule(rule, val);
			}, this);
		},
		
		/**
		 * evaluate a value with given rule
		 */
		evaluateRule: function(rule, val) {
			if (rule.operator === "GT") {
				return rule.value < val;
			} else if (rule.operator === "LT") {
				return rule.value > val;
			}
			return rule.value === val;
		}
}

module.exports = weatherRecommendedRateRule;
