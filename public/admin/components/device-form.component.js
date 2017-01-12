/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
(function(scriptBaseUrl){
	angular.module('devices', []).
	component('deviceForm', {
		templateUrl: function($element, $attrs) {
			// disable device id field if device id is specified in URL
			angular.deviceId = $attrs.deviceid;
			angular.typeId = $attrs.typeid;
		    return scriptBaseUrl + 'device-form.html';
		},
		controller: function deviceForm($scope, $http) {

			$scope.deviceId = angular.deviceId;
			$scope.typeId =  angular.typeId;

			$scope.fixedDeviceId = $scope.deviceId;
			$scope.updateMode = $scope.deviceId && $scope.deviceId.length > 0;
			$scope.deviceDetails = {};
			
			// http request template
			function httpRequest(request, message, callback, errback) {
				$scope.deviceNotFound = false;
				$scope.haserror = false;
				$scope.message = message;
				$scope.requestSending = true;
				return $http(request).success(function(data, status) {
					$scope.message = "";
					$scope.requestSending = false;
					callback && callback(data, status);
				}).error(function(error, status) {
					errorReport(error, status);
					$scope.requestSending = false;
					errback && errback(error, status);
				});
			};
			
			var deviceId = this.deviceId;
			function getUrl() {
				var url = "/admin/device";
				if ($scope.typeId) {
					url += ('/' + $scope.typeId);
				}
				if ($scope.deviceId) {
					if (!$scope.typeId) url += ('/_');
					url += ('/' + $scope.deviceId);
				}
				return url;
			};

			function errorReport(error, status) {
				var message = "";
				if (status) {
					message += "Error(" + status + "): " + (error.statusText || error.error || "Unkown Error");
				}
				if (error.responseText) {
					try {
						var response = JSON.parse(error.responseText);
						if (response && response.message) {
							message += " : " + response.message;
						}
					} catch (e) {};
				} else if (message.length == 0) {
					message = error;
				}
				$scope.haserror = true;
				$scope.message = message;
			};

			// initialize device details
			if ($scope.updateMode) {
				httpRequest({
					type : 'get',
					url : getUrl(),
				}, null, function(data) {
					$scope.deviceDetails = data;
				}, function(error, status) {
					if (status === 404) {
						$scope.message = "";
						$scope.hasError = false;
					}
				});
			} else {
				$scope.deviceDetails = {
					name: "Your car's name",
					license: "000-00-0000",
					model: {
						makeModel: "Your car's model",
						year: new Date().getFullYear(),
						mileage: 0,
						stars: 3,
						hourlyRate: 12,
						dailyRate: 40,
						thumbnailURL: "https://url_of_your_photo",
						type: "Family",
						drive: "FF"
					}
				};
			}
			
			// create or update a device
			$scope.onsubmit = function() {
				$scope.createdDevice = null;

				var valid = true;
				for (var i in $scope.deviceForm) {
					var check = $scope.deviceForm[i];
					if (check && check.$invalid) {
						errorReport("Invalid values are specified or mandatory fields are empty.");
						return;
					}
				}
				
				httpRequest({
					method : $scope.updateMode ? 'put' : 'post',
					url : getUrl(),
					data : $scope.deviceDetails,
					headers: {
						'Content-Type': "application/JSON;charset=utf-8"
					}
				}, null, function(data) {
					if ($scope.updateMode) {
						$scope.message = "Updated successfully!";
					} else {
						$scope.message = "Created successfully!";
						$scope.createdDevice = data;
					}
				});
			};
			
			// delete a device
			$scope.ondelete = function() {
				if (!confirm("Are you sure you want to delete this device?"))
					return;

				httpRequest({
					method : 'delete',
					url : getUrl()
				}, null, function(data) {
					$scope.deviceRemoved = true;
					$scope.message = "Deleted successfully!";
				});
			};
		}
	});
})((function(){
	// tweak to use script-relative path
	var scripts = document.getElementsByTagName('script');
	var scriptUrl = scripts[scripts.length - 1].src;
	return scriptUrl.substring(0, scriptUrl.lastIndexOf('/') + 1);
})());
