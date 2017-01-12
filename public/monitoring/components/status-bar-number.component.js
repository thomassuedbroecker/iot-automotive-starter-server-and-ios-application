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
	component('statusBarNumber', {
		templateUrl: scriptBaseUrl + 'status-bar-number.html',
		bindings: {
			title: '@',
			src: '@',
		},
		controller: function NumberOfCars($scope, $http) {
			var self = this;
			// example data
			$scope.title = $scope.$ctrl.title;
			$scope.value = '--';
			$scope.value_today = '--';
			$scope.value_week = '--';
			$scope.value_month = '--';
			// initialize with REST call
			$http.get(self.src).then(function(resp){
				if(typeof resp.data.value !== 'undefined'){
					$scope.title = $scope.$ctrl.title;
					$scope.value = resp.data.value;
					$scope.value_today = resp.data.value_today;
					$scope.value_week = resp.data.value_week;
					$scope.value_month = resp.data.value_month;
				}else{
					console.error('Unknown user count data', resp.data);
				}
			});
		},
	});
})((function(){
	// tweak to use script-relative path
	var scripts = document.getElementsByTagName('script');
	var scriptUrl = scripts[scripts.length - 1].src;
	return scriptUrl.substring(0, scriptUrl.lastIndexOf('/') + 1);
})());
