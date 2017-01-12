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
	component('deviceList', {
		templateUrl: function($element, $attrs) {
			// disable device id field if device id is specified in URL
			angular.mode = $attrs.mode;
		    return scriptBaseUrl + 'device-list.html';
		},
		controller: function deviceList($scope, $http) {

			$scope.monitorMode = angular.mode === "monitoring";
			$scope.selection = {};
			
			// http request template
			function httpRequest(request, message, callback, errback) {
				$scope.deletedisable = true;
				$scope.selectall = false;
				$scope.selection = {};
				$scope.haserror = false;
				$scope.message = message;
				$scope.requestSending = true;
				return $http(request).success(function(data, status) {
					$scope.message = "";
					$scope.requestSending = false;
					callback && callback(data, status);
				}).error(function(error, status) {
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
					$scope.requestSending = false;
					$scope.haserror = true;
					$scope.message = message;
					errback && errback(error, status);
				});
			};
			
			// load contents
			function loadContents() {
				// reset data before loading
				$scope.alldevices = [];
				$scope.noContents = true;

				httpRequest({
					method: "get",
					url: $scope.monitorMode ? "/monitoring/device" : "/admin/device"
				}, null, function(data) {
					$scope.alldevices = data;
					$scope.noContents = !data || data.length == 0;
				});
			};
			
			// delete selected devices
			function deleteSelected() {
				var devices = [];
				for (var deviceId in $scope.selection) {
					$scope.selection[deviceId] && $scope.alldevices.forEach(function(device) {
						if (device.deviceId !== deviceId)
							return;
						var d = {deviceID: device.deviceId};
						if (device.typeId) d.typeID = device.typeId;
						devices.push(d);
					});
				}

				var message = null;
				if (devices.length === 0) {
					return false;
				} else if (devices.length === 1) {
					message = "Are you sure you want to delete selected device?";
				} else {
					message = "Are you sure you want to delete $s devices?".replace("$s", devices.length);
				}
				if (!confirm(message))
					return;

				httpRequest({
					method: "delete",
					url: "/admin/device",
					data: {devices: devices},
					headers: {
						'Content-Type': "application/JSON;charset=utf-8"
					}
				}, null, function(data) {
					loadContents();
				});
			}

			// check or uncheck all checkboxes 
			$scope.onselectAll = function(checked) {
				$scope.deletedisable = !checked;
				if (checked) {
					$scope.alldevices.forEach(function(d) { 
						$scope.selection[d.deviceId] = true; 
					});
				} else {
					$scope.selection = {};
				}
			};

			// one of checkboxes is selected or unselected
			$scope.onselectionChanged = function(checked) {
				if (checked) {
					$scope.deletedisable = false;
				} else {
					$scope.selectall = false;
					for (var deviceId in $scope.selection) {
						if ($scope.selection[deviceId]) {
							$scope.deletedisable = false;
							return;
						}
					}
					$scope.deletedisable = true;
				}
			};
			
			// reload button handler
			$scope.onreload = function() {
				loadContents();
			};

			// create button handler
			$scope.oncreate = function() {
				window.location.href = "/admin/ui/device/form";
			};
			
			// delete button handler
			$scope.ondeleteSelected = function() {
				deleteSelected();
			};

			// load contents
			$scope.selection = [];
			loadContents();

			$scope.tableFilter = function(device) {
				return !$scope.monitorMode || device.typeId;
		    }
		}
	}).filter('dateFormat', function() {
		return function(data) {
			return data ? new Date(data).toLocaleString() : "";
		};
	});
})((function(){
	// tweak to use script-relative path
	var scripts = document.getElementsByTagName('script');
	var scriptUrl = scripts[scripts.length - 1].src;
	return scriptUrl.substring(0, scriptUrl.lastIndexOf('/') + 1);
})());
