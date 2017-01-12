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
var debug = require('debug')('recommendation');
debug.log = console.log.bind(console);

/**
 * Recommendation Engine
 */
var recommendation = {
		recommendationConfig : function() {
			// Hardcoded rules. Only weather-based rule is supported now.
			var weatherRule = require("./weatherRecommendedRateRule.js");
			return {
				rules : [weatherRule]
			}
		}(),
		
		/**
		 * pre-call before calculating recommended rate. In this method, each recommended rule can prepare common properties 
		 * to be used to calculate recommended rate. 
		 */
		precalcRecommendedRate: function(filters) {
			return Q.all(this.recommendationConfig.rules.map(function(rule, index) {
				if (rule.precalcRecommendedRate) {
					return rule.precalcRecommendedRate(filters).then(function(properties) {
						if (!filters) filters = {};
						var rule_properties = filters["rule_properties"] = {};
						rule_properties[index] = properties;
					});
				} else {
					return Q(true);
				}
			}));
		},
		
		/**
		 * Calculate recommended rate for given device using registered rules
		 * 
		 * @return rate in json  
		 * {
		 * 	   rate: <recommended rate in double>,
		 *     causes: [
		 *         {
		 *            category: "<component that calculated the rate>", 
		 *            shortText: "<cause of the rate e.g.rain, snow>", 
		 *            longText: "<cause of the rate>" 
		 *         }, ...
		 *     ]
		 * }
		 */
		calcRecommendedRate: function(deviceDetails, filters) {
			var totalRate = {rate: 1.0, causes: []};
			return Q.all(this.recommendationConfig.rules.map(function(rule, index) {
				var rule_properties = filters["rule_properties"];
				var properties = rule_properties[index];

				return rule.calcRecommendedRate(deviceDetails, filters, properties).then(function(ruleRate) {
					if (ruleRate) {
						totalRate.rate *= ruleRate.rate;
						if (ruleRate.causes && ruleRate.causes.length > 0) {
							totalRate.causes = totalRate.causes.concat(ruleRate.causes);
						}
					}
				});
			})).then(function() {
				return totalRate;
			});
		}
}

module.exports = recommendation;
