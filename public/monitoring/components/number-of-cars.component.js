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
 * Additional styles, javascripts
 * my css: /monitoring/css/style.css, the base monitoring dashbaord css
 */

(function(scriptBaseUrl){
	angular.module('systemMonitoring').
	component('numberOfCars', {
		templateUrl: scriptBaseUrl + 'number-of-cars.html',
		bindings: {
			region: '<',
			regions: '<',
		},
		controller: function NumberOfCars($scope, $http) {
			// example data
			var sampleData = {
					all: 25,
					in_use: 11,
					available: 10,
					unavailable: 4,
			};
			// loading data
			var loadingData = {
					all: '-',
					in_use: '-',
					available: '-',
					unavailable: '-',
			};
			
			// initialize model
			$scope.counts = {}; // map region.id => counts
			$scope.counts._selection = loadingData;
			
			// initialize controller
			var regionTracker = null;
			var updateTracker = function(regions, selected_id){
				if (regions && regions.length > 0){
					if (regionTracker){
						regionTracker.stop();
						regionTracker = null;
					}
					regionTracker = new RegionTracker(regions, selected_id);
					regionTracker.start();
				}
			};
			$scope.$watch('$ctrl.region', function(region, oldValue){
				if(region)
					updateTracker([region], region.id);
			});
			$scope.$watch('$ctrl.regions', function(regions, oldValue){
				updateTracker(regions);
			});
			
			/*
			 * Car number tracker definition
			 */
			var RegionTracker = function(regions, selected_id){
				var active = true; // this is for deferred handlers to find the status
				var timeoutKey = null;
				
				// update number tracking
				var update = function(){
					regions.forEach(function(region, i){
						var extent = region.extent, region_id = region.id;
						// draw real-time location of cars
						var qs = ['min_lat='+extent[1], 'min_lng='+extent[0],
						          'max_lat='+extent[3], 'max_lng='+extent[2],
						          'countby=status'].join('&');
						$http.get('cars/query?' + qs).then(function(resp){
							if(!active) return;
							if(typeof resp.data.all !== 'undefined'){
								// update the model
								var counts = resp.data;
								var newData = {
									all: counts.all,
									in_use: counts.in_use,
									available: counts.available,
									unavailable: counts.unavailable,
								};
								$scope.counts[region_id] = newData;
								if(region_id === selected_id)
									$scope.counts._selection = newData;
							}else{
								console.error('Unknown number of car data from server: ', resp.data);
								$scope.counts[region_id] = loadingData;
								if(region_id === selected_id)
									$scope.counts._selection = loadingData;
							}
							// schedule next
							if(i == regions.length - 1)
								timeoutKey = setTimeout(update, 15000); // polling by 15 seconds
						}, function(e){
							if(!active) return;
							console.warn('Failed to execute car query. Setting sample data...');
							$scope.counts[region_id] = sampleData;
							if(region_id === selected_id)
								$scope.counts._selection = sampleData;
						});
					});
					if(!regions || regions.length == 0)
						timeoutKey = setTimeout(update, 15000); // polling by 15 seconds
				}
				
				// method to stop tracking
				this.stop = function(){
					// clear timeout
					if (timeoutKey) clearTimeout(timeoutKey);
					timeoutKey = null;
					// deactivate
					active = false;
				};
				
				// set loading data and start updating
				this.start = function(){
					regions.forEach(function(region){
						$scope.counts[region.id] = loadingData;
					});
					//$scope.counts._selection = loadingData;
					update();
				};
			};
		},
	});
})((function(){
	// tweak to use script-relative path
	var scripts = document.getElementsByTagName('script');
	var scriptUrl = scripts[scripts.length - 1].src;
	return scriptUrl.substring(0, scriptUrl.lastIndexOf('/') + 1);
})());
