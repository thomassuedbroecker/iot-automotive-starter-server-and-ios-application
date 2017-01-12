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
 * my css: car-monitor.css
 * OpenLayers 3.5:
 *   <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/ol3/3.5.0/ol.css" type="text/css">
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/ol3/3.5.0/ol.js"></script>
 * rx-lite 3.1.2, rxjs-dom 7.0.3:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/rxjs/3.1.2/rx.lite.js"></script>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/rxjs-dom/7.0.3/rx.dom.js"></script>
 */

(function(scriptBaseUrl){
	/**
	 * The default zoom value when the map `region` is set by `center`
	 */
	var DEFAULT_ZOOM = 15;
	
	// internal settings
	var INV_MAX_FPS = 1000 / 10;
	var ANIMATION_DELAY = 2000;
	var DEFAULT_MOVE_REFRESH_DELAY = 500;
	var CAR_STATUS_REFRESH_PERIOD = 0 // was 15000; now, setting 0 not to update via polling (but by WebSock)
	var NEXT_MAP_ELEMENT_ID = 1;
	
	angular.module('systemMonitoring').
	component('realtimeMap', {
		templateUrl: scriptBaseUrl + 'realtime-map.html',
		bindings: {
			region: '<',
			onChangeExtent: '&',
		},
		controller: function RealtimeMapController($scope, $http) {
			var self = this;
			
			// debug
			$scope.switchDebug = function() { $scope.DEBUG = !$scope.DEBUG; }
			$scope.DEBUG = false;
			$scope.debugData = "[none]";
			$scope.debugOut = function(){
				var extent = map.getView().calculateExtent(map.getSize());
				extent = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
				var center = ol.proj.toLonLat(map.getView().getCenter());
				$scope.debugData = "" + JSON.stringify(extent) + ", Center:" + JSON.stringify(center);
			};
			
			// important model variables
			$scope.mapElementId = 'carmonitor';// + (NEXT_MAP_ELEMENT_ID ++);
			$scope.popoverElementId = 'carmonitorpop';// + (NEXT_MAP_ELEMENT_ID - 1);
			
			// initializer
			self.$onInit = function() {
				initMap();
			};
			
			// region change from external
			$scope.$watch('$ctrl.region', function(region, oldValue){
				console.log("MoveMap", region);
				mapHelper.moveMap(region);
			});
			
			//
			// Compose Map component
			//
			var map; // the ol.Map instance
			var mapHelper; // a helper which provides useful features for animation to the map
			var eventsLayer, carsLayer; // layers
			// initialize map
			// - construct a map instance with layers
			// - setup view change event handler (to track visible extent)
			// - setup popover
			// - setup animation
			var initMap = function initMap(){
				// create layers
				eventsLayer = new ol.layer.Vector({
					source: new ol.source.Vector(),
					style: function(feature){
						return getDrivingEventStyle(feature.get('drivingEvent'));
					}
				});
				// car layer with rendering style
				carsLayer = new ol.layer.Vector({
					source: new ol.source.Vector(),
					style: function(feature){
						return getCarStyle(feature.get('carStatus'));
					}
				});
				// create a map
				map =  new ol.Map({
					controls: ol.control.defaults({
						attributionOptions: /** @type {olx.control.AttributionOptions} */ ({
							collapsible: false
						})
					}),
					target: document.getElementById($scope.mapElementId),
					layers: [
						new ol.layer.Tile({
							//source: new ol.source.MapQuest({layer: 'sat'}),
							source: new ol.source.OSM({
								//wrapX: false,
								//url: 'url: //{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png', // default
							}),
							preload: 4,
						}),
						eventsLayer,
						carsLayer
					],
					view: new ol.View({
						center: ol.proj.fromLonLat(($scope.$ctrl.region && $scope.$ctrl.region.center) || [0, 0]),
						zoom: (($scope.$ctrl.region && $scope.$ctrl.region.zoom) || DEFAULT_ZOOM)
					}),
				});
				mapHelper = new MapHelper(map);
				
				// setup view change event handler
				mapHelper.postChangeViewHandlers.push(function(extent){
					stopCarTracking(true); // true to move to next extent smoothly
					startCarTracking(extent);
					// fire event
					$scope.$ctrl.onChangeExtent({extent: extent});
				});
				
				//
				// Setup popover
				//
				mapHelper.addPopOver({
						elm: document.getElementById($scope.popoverElementId),
						pin: true,
						updateInterval: 1000,
					}, 
					function showPopOver(elem, feature, pinned, closeCallback){
						if(!feature) return;
						var content = getPopOverContent(feature);
						if(content){
							var title = '<div>' + (content.title ? _.escape(content.title) : '') + '</div>' + 
									(pinned ? '<div><span class="btn btn-default close">&times;</span></div>' : '');
							var pop = $(elem).popover({
								//placement: 'top',
								html: true,
								title: title,
								content: content.content
							});
							if(pinned){
								pop.on('shown.bs.popover', function(){
									var c = $(elem).parent().find('.popover .close');
									c.on('click', function(){
										closeCallback && closeCallback();
									});
								});
							}
							$(elem).popover('show');
						}
					}, 
					function destroyPopOver(elem, feature, pinned){
						if(!feature) return;
						$(elem).popover('destroy');
					}, 
					function updatePopOver(elem, feature, pinned){
						if(!feature) return;
						var content = getPopOverContent(feature);
						if(content){
							var popover = $(elem).data('bs.popover');
							if(popover.options.content != content.content){
								popover.options.content = content.content;
								$(elem).popover('show');
							}
						}
					});
				
				// popover - generate popover content from ol.Feature
				var getPopOverContent = function getPopOverContent(feature){
					var content = feature.get('popoverContent');
					if(content)
						return {content: '<span style="white-space: nowrap;">' + _.escape(content) + '</span>' };
					
					var device = feature.get('device');
					if(device){
						var result = { content: '', title: undefined };
						result.content = '<span style="white-space: nowrap;">ID: ' + _.escape(device.deviceID) + "</style>";
						var info = device.latestInfo;
						var sample = device.latestSample;
						if(sample && $scope.DEBUG){
							var content = '<div class="">Connected: ' + sample.device_connection + '</div>' +
										  '<div class="">Device status: ' + sample.device_status + '</div>';
							result.content += content;
						}
						if(info){
							if(info.name && info.makeModel){
								result.title = info.name;
							}else if(info.name){
								result.title = info.name;
							}
							if(info.reservation){
								var content = "";
								if(sample && sample.status == 'in_use'){
									content = 'Reserved until ' + moment(parseInt(info.reservation.dropOffTime) * 1000).calendar();
								}else{
									content = 'Reserved from ' + moment(parseInt(info.reservation.pickupTime) * 1000).calendar();
								}
								result.content += '<div class="marginTop-10" style="white-space: nowrap;">' + content + '</div>';
							}
						}
						if(sample && sample.status == 'in_use'){
							if(sample.speed){
								result.content += '<div class="">Speed: ' + sample.speed.toFixed(1) + 'km/h</div>';
							}
							if(sample.matched_heading){
								var heading = +sample.matched_heading;
								heading = (heading < 0) ? heading + 360 : heading;
								var index = Math.floor(((heading/360 + 1/32) % 1) * 16);
								var dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
								var dir = dirs[index];
								result.content += '<div class="">Heading: ' + dir + '</div>';
							}
						}
						return result;
					}
					return null;
				};
				
				// setup animation
				// - workaround styles
				preloadStyles(map, CAR_STYLES);
				// - define feature synchronizer
				var syncCarFeatures = function(devices, frameTime, surpussEvent){
					devices.forEach(function(device){
						var cur = device.getAt(frameTime); // get state of the device at frameTime
						var curPoint = (cur.lng && cur.lat) ? new ol.geom.Point(ol.proj.fromLonLat([cur.lng, cur.lat])) : null;
						var curStatus = cur.status || null;
						
						var feature = device.feature;
						if(curPoint && !feature){
							// create a feature for me
							feature = new ol.Feature({ 
								geometry: curPoint,
								carStatus: curStatus,
								//style: getCarStyle(curStatus),  //WORKAROUND: not sure why layer style not work
								device: device,
							});
							if(curStatus)
								feature.setStyle(getCarStyle(curStatus));
							carsLayer.getSource().addFeature(feature);
							device.feature = feature;
						}else if(curPoint && feature){
							// update
							if(curStatus && curStatus !== feature.get('carStatus')){
								feature.set('carStatus', curStatus, surpussEvent);
								feature.setStyle(getCarStyle(curStatus)); //WORKAROUND: not sure why layer style not work
							}
							if(curPoint.getCoordinates() != feature.getGeometry().getCoordinates()){
								feature.setGeometry(curPoint);
							}
						}else if(!curPoint && feature){
							// remove feature
							carsLayer.getSource().removeFeature(feature);
							device.feature = null;
						}
					});
				}
				// - register rendering handlers
				mapHelper.preComposeHandlers.push(function(event, frameTime){
					syncCarFeatures(animatedDeviceManager.getDevices(), frameTime);
				});
				mapHelper.postComposeHandlers.push(function(event, frameTime){
					return INV_MAX_FPS; // give delay for next frame if not other events captured
				});
			};
			
			//
			// Devices management
			//
			var animatedDeviceManager = new AnimatedDeviceManager();
			
			//
			// Connection to server and reflecting the response to the Map
			//
			var activeWsClient = null, activeWsSubscribe = null; // WebSocket client
			var carStatusIntervalTimer;
			
			/**
			 * Start trackgin a region
			 */
			var startCarTracking = function startTracking(extent){
				var xt = expandExtent(extent, 0.5); // get extended extent to track for map
				var qs = ['min_lat='+xt[1], 'min_lng='+xt[0],
				          'max_lat='+xt[3], 'max_lng='+xt[2]].join('&');
				// handle cars
				refreshCarStatus(qs).then(function(resp){
					// adjust animation time
					if(resp.data.serverTime){
						mapHelper.setTimeFromServerRightNow(resp.data.serverTime);
					}
					
					// start websock server for real-time tracking
					stopWsClient();
					if (resp.data.wssPath){
						var startWssClient = function(){
							var wsProtocol = (location.protocol == "https:") ? "wss" : "ws";
							var wssUrl = wsProtocol + '://' + window.location.host + resp.data.wssPath;
							// websock client to keep the device locations latest
							var ws = activeWsClient = Rx.DOM.fromWebSocket(wssUrl);
							activeWsSubscribe = ws.subscribe(function(e){
								var msg = JSON.parse(e.data);
								animatedDeviceManager.addDeviceSamples(msg.devices);
							}, function(e){
								if (e.type === 'close'){
									activeWsSubscribe = null;
									ws.observer.dispose();
									// handle close event
									if(ws === activeWsClient){ // reconnect only when this ws is active ws
										console.log('got wss socket close event. reopening...')
										activeWsClient = null;
										startWssClient(); // restart!
										return;
									}
								}
								// error
								console.error('Error event from WebSock: ', e);
							});
						};
						startWssClient(); // start wss
					}
					
					// start animation
					mapHelper.startAnimation();
					
					// schedule status timer
					var carStatusTimerFunc = function(){
						refreshCarStatus(qs);
						carStatusIntervalTimer = setTimeout(carStatusTimerFunc, CAR_STATUS_REFRESH_PERIOD);
					}
					if(CAR_STATUS_REFRESH_PERIOD > 0)
						carStatusIntervalTimer = setTimeout(carStatusTimerFunc, CAR_STATUS_REFRESH_PERIOD);
				}, function(err){
					console.warn('it\'s fail to access the server.');
				})
				
				// handle driver events
				refreshDriverEvents(qs);
			};
			// Add/update cars with DB info
			var refreshCarStatus = function(qs) {
				return $http.get('cars/query?' + qs).then(function(resp){
					if(resp.data.devices){
						animatedDeviceManager.addDeviceSamples(resp.data.devices);
					}
					return resp; // return resp so that subsequent can use the resp
				});
			};
			// Add driver events on the map
			var refreshDriverEvents = function refreshDriverEvents(qs){
				return $http.get('drivingEvents/query?' + qs).then(function(resp){
					var events = resp.data.events;
					if (events){
						// create markers
						var markers = events.map(function(event){
							var result = new ol.Feature({
								geometry: new ol.geom.Point(ol.proj.fromLonLat([event.s_longitude, event.s_latitude])),
								popoverContent: event.event_name,
							});
							result.setStyle(getDrivingEventStyle(event)); //WORKAROUND not sure why layer style not work
							return result;
						});
						// update layer contents
						eventsLayer.getSource().clear();
						eventsLayer.getSource().addFeatures(markers);
					}
				});
			};
			
			/**
			 * Stop server connection
			 */
			var stopCarTracking = function stopTracking(intermediate){
				// stop timer
				if(carStatusIntervalTimer){
					clearTimeout(carStatusIntervalTimer);
					carStatusIntervalTimer = 0;
				}
				if(!intermediate){
					// stop animation
					mapHelper.stopAnimation();
					// stop WebSock client
					stopWsClient();
				}
			};
			var stopWsClient = function stopWsClient(){
				if (activeWsSubscribe){
					activeWsSubscribe.dispose();
					activeWsSubscribe = null;
				}
				if (activeWsClient){
					activeWsClient.observer.dispose();
					activeWsClient = null;
				}
			}
		}
	});
	
	
	/* --------------------------------------------------------------
	 * AnimatedDevice
	 * 
	 * This class manages devices and update the device data with device
	 * samples sent from the server.
	 */
	var AnimatedDeviceManager = function AnimatedDeviceManager(){
		this.devices = {}; // map from ID to AnimatedDevice
	};
	AnimatedDeviceManager.prototype.getDevice = function(id){
		return this.devices[id];
	};
	AnimatedDeviceManager.prototype.getDevices = function(id){
		var self = this;
		return Object.keys(this.devices).map(function(id){
			return self.devices[id];
		});
	};
	AnimatedDeviceManager.prototype.addDeviceSamples = function(newDeviceSamples){
		var self = this;
		[].concat(newDeviceSamples).forEach(function(sample){
			if(!sample) return;
			// update the device latest location
			var device = self.devices[sample.deviceID];
			if(device){
				device.addSample(sample);
			} else {
				device = self.devices[sample.deviceID] = new AnimatedDevice(sample);
			}
		});
	};
	
	/* --------------------------------------------------------------
	 * AnimatedDevice
	 * 
	 * This class manages data for a single device and provides read/update
	 * access to the data. The incoming data would be a series of samples which
	 * includes a timestamp and the device metrics (e.g. position of a car).
	 * For such series of data, this class provides linear approximation for
	 * the metrics for any timestamp.
	 */
	var AnimatedDevice = function(initial_sample){
		var s0 = angular.copy(initial_sample);
		s0.t = 0; // move to epoc
		this.samples = [s0];
		this.deviceID = s0.deviceID;
		this.latestInfo = null;
			// this will store device information which is not frequently changed
		// add sample
		this.addSample(initial_sample);
	};

	AnimatedDevice.prototype.getAt = function(animationProgress){
		var linearApprox = function(s0, s1, prop, t){
			var t0 = s0.t, t1 = s1.t, v0 = s0[prop], v1 = s1[prop];
			if(t1 == t0) return v1; // assume that t0 < t1
			var r = ((v1-v0)/(t1-t0)) * (t-t0) + v0;
			return r;
		};
		
		var r = null; // result
		
		var i_minus_1 = this.samples.length - 1;
		while (i_minus_1 >= 0 && this.samples[i_minus_1].t > animationProgress){
			i_minus_1 --;
		}
		var i = i_minus_1 + 1;
		if (0 <= i_minus_1 && i < this.samples.length){
			var s0 = this.samples[i_minus_1];
			var s1 = this.samples[i];
			r = angular.copy(s1);
			['lat', 'lng'].forEach(function(prop){
				r[prop] = linearApprox(s0, s1, prop, animationProgress);
			})
		} else if (i_minus_1 == this.samples.length - 1){
			var s0 = this.samples[i_minus_1];
			r = s0; // no approximation
		} else if (i == 0 && i < this.samples.length){
			var s0 = this.samples[i];
			r = s0; // no approximation
		} else
			throw new Error('Never');
		
		this.removeOldSamples(animationProgress);
		return r;
	};

	AnimatedDevice.prototype.addSample = function(sample, animationProgress){
		// add missing props from previous sample
		var prev = this.samples.length > 0 ? this.samples[this.samples.length-1] : null;
		if(prev){
			Object.keys(prev).forEach(function(prop){
				if (typeof sample[prop] === 'undefined')
					sample[prop] = prev[prop];
			});
		}
		// update considering sample time
		sample.t = sample.t || sample.lastEventTime || sample.lastUpdateTime || (new Date().getTime());
		if (sample.t > this.samples[this.samples.length-1].t){
			this.samples.push(sample);
		}else if(sample.t < this.samples[this.samples.length-1].t){
			console.log('sample is reverted by %d', this.samples[this.samples.length-1].t - sample.t)
		}else{
			this.samples[this.samples.length-1] = sample; // replace
		}
		this.removeOldSamples(animationProgress);
		// update the latest additional info
		this.latestSample = sample;
		if(sample.info)
			this.latestInfo = sample.info;
	};

	AnimatedDevice.prototype.removeOldSamples = function(animationProgress){
		if(!animationProgress) return;
		// remove old samples
		var i = _.findIndex(this.samples, function(s){ // now i is the first one t > sim_now
			return s.t > animationProgress;
		});
		var deleteCount;
		if (i == -1) {
			// when there is no data newer than sim_now, we keep the last `1`
			deleteCount = this.samples.length - 1; // '1' is the number of samples that we need to retain
		} else {
			// keep `1` old data
			deleteCount = i - 1;
		}
		if (deleteCount > 1)
			this.samples.splice(0, deleteCount);
	};

	/* --------------------------------------------------------------
	 * MapHelper
	 * 
	 * This class provides additional capabilities to OpenLayer 3 Map
	 * for animation, visible extent tracking, and popover.
	 * 
	 * Usage:
	 * 1. initialize with map instance
	 *   var mapHelper = new MapHelper(map);
	 * 2. adjust time by setting server-time as soon as received it from server
	 *   mapHelper.setTimeFromServerRightNow(serverTime);
	 * 3. add callbacks
	 * 3.1 add animation stuffs
	 *   mapHelper.preComposeHandlers.push(function(event, frameTime){ ... });
	 *   mapHelper.postComposeHandlers.push(function(event, frameTime){ ... return 100; });
	 * 3.2 add move listeners
	 *   mapHelper.postChangeViewHandlers.push(function(extent){ ... });
	 * 3.3 add popover stuffs
	 *   mapHelper.addPopOver(popoverElement, 
	 *                        function(elm, feature){ show popover with elm },
	 *                        function(elm, feature){ dismiss the popover with elm });
	 * 4. move map
	 *   mapHelper.moveMap({center: [lng, lat]})
	 * 5. start animation
	 *   mapHelper.startAnimation();
	 * 
	 * Event Handlers:
	 * preComposeHandlers: a list of function(ol.render.Event, frameTime)
	 * - where frameTime in millis is the server time for this frame
	 *   - the server time is calculated considering this.adjustTime and event.frameState.time
	 * postComposeHandlers: a list of function(ol.render.Event, frameTime)
	 * - where the parameters are the same to preComposeHandlers, but the function can return value
	 *   for next render timing.
	 *   - integer >= 0: next render time. 0 to call map.render() immediately, a number
	 *     to schedule next call of map.render()
	 *   - otherwise, don't schedule anything
	 * postChangeViewHandlers: a list of function(extent)
	 * - where the extent is map extent in WSG [lng0, lat0, lng1, lat1]
	 */
	var MapHelper = function(map){
		// the map
		this.map = map;
		
		 // time in millis adjustment
		
		// initialize animation
		this.animating = false;
		this.animationDelay = ANIMATION_DELAY;
		this.serverTimeDelay = 0;
		this.preComposeHandlers = [];
		this.postComposeHandlers = [];
		this._onPreComposeFunc = this._onPreCompose.bind(this);
		this._onPostComposeFunc = this._onPostCompose.bind(this);
		
		// move event handlers
		this.moveRefreshDelay = DEFAULT_MOVE_REFRESH_DELAY;
		this.postChangeViewHandlers = [];
		this._postChangeViewLastExtent = null;
		this._postChangeViewTimer = null;
		this.map.getView().on('change:center', this._onMapViewChange.bind(this));
		this.map.getView().on('change:resolution', this._onMapViewChange.bind(this));
		
		// setup map resize handler
		this.installMapSizeWorkaround();
	}
	/**
	 * Start animation
	 */
	MapHelper.prototype.startAnimation = function startAnimation(){
		if(this.animating)
			this.stopAnimation(false);
		
		console.log('Starting animation.')
		this.animating = true;
		this.map.on('precompose', this._onPreComposeFunc);
		this.map.on('postcompose', this._onPostComposeFunc);
		this.map.render();
	};
	/**
	 * Stop animation
	 */
	MapHelper.prototype.stopAnimation = function stopAnimation(){
		this.animating = false;
		this.nextRenderFrameTime = 0;
		this.map.un('precompose', this._onPreComposeFunc);
		this.map.un('postcompose', this._onPostComposeFunc);
	};
	/**
	 * Set the server time
	 * @param serverTime the latest server time received from server
	 * @param now optional. the base time
	 * Note that we want to get estimated server time as follow:
	 *   estimated server time ~== Date.now() - this.serverTimeDelay 
	 */
	MapHelper.prototype.setTimeFromServerRightNow = function(serverTime, now){
		this.serverTimeDelay = (now || Date.now()) - serverTime;
		console.log('Set server time delay to %d.', this.serverTimeDelay);
	};
	// get the estimated server time
	MapHelper.prototype.getServerTime = function(now){
		return (now || Date.now()) - this.serverTimeDelay;
	};
	// handle precompose event and delegate it to handlers
	MapHelper.prototype._onPreCompose = function _onPreCompose(event){
		if (this.animating){
			//var vectorContext = event.vectorContext;
			var frameState = event.frameState;
			var frameTime = this.getServerTime(frameState.time) - this.animationDelay;
			if(this.nextRenderFrameTime < frameTime){
				this.preComposeHandlers.forEach(function(handler){ handler(event, frameTime); });
				this.nextRenderFrameTime = 0; // unschedule next
				//console.log('Updated fatures.');
			}
		}
	};
	// handle postcompose event and delegate it to handlers, schedule next render
	MapHelper.prototype._onPostCompose = function _onPostCompose(event){
		if (this.animating){
			//var vectorContext = event.vectorContext;
			var frameState = event.frameState;
			var frameTime = this.getServerTime(frameState.time) - this.animationDelay;
			var nextRender = -1;
			this.postComposeHandlers.forEach(function(handler){ 
				var nextRenderDuration = handler(event, frameTime);
				nextRenderDuration = parseInt(nextRenderDuration);
				if(nextRenderDuration >= 0 && nextRender < nextRenderDuration)
					nextRender = nextRenderDuration;
			});
			// set next render time when not scheduled
			if(!this.nextRenderFrameTime){
				this.nextRenderFrameTime = frameTime + (nextRender > 0 ? nextRender : 0);
				if(nextRender <= 10){
					if(this.animating)
						this.map.render();
				}else{
					setTimeout((function(){
						if(this.animating)
							this.map.render();
					}).bind(this), nextRender);
				}
			}
		}
	};
	
	/**
	 * Move visible extent to the specified region
	 * @param region
	 *   case 1: { extent: [lng0, lat0, lng1, lat1] }
	 *   case 2: { center: [lng0, lat0], (zoom: 15) } // zoom is optional
	 */
	MapHelper.prototype.moveMap = function moveMap(region){
		if(region.extent){
			var mapExt = ol.proj.transformExtent(region.extent, 'EPSG:4326', 'EPSG:3857'); // back to coordinate
			var view = this.map.getView();
			if (view.fit){
				view.fit(mapExt, this.map.getSize());
			} else if (view.fitExtent){
				view.setCenter([(mapExt[0]+mapExt[2])/2, (mapExt[1]+mapExt[3])/2]);
				view.fitExtent(mapExt, this.map.getSize());
			} else {
				view.setCenter([(mapExt[0]+mapExt[2])/2, (mapExt[1]+mapExt[3])/2]);
				view.setZoom(15);
			}
			this._firePendingPostChangeViewEvents(10);
		}else if(region.center){
			var mapCenter = ol.proj.fromLonLat(region.center);
			var view = this.map.getView();
			view.setCenter(mapCenter);
			view.setZoom(region.zoom || DEFAULT_ZOOM);
			this._firePendingPostChangeViewEvents(10);
		}else{
			console.error('  Failed to start tracking an unknown region: ', region);
		}
	};
	// schedule deferrable postChangeView event 
	MapHelper.prototype._onMapViewChange = function _onMapViewChange(){
		// schedule deferrable event
		if(this._postChangeViewTimer){
			clearTimeout(this._postChangeViewTimer);
		}
		this._postChangeViewTimer = setTimeout(function(){
			this._firePendingPostChangeViewEvents(); // fire now
		}.bind(this), this.moveRefreshDelay);
	};
	// schedule indeferrable postChangeView event
	MapHelper.prototype._firePendingPostChangeViewEvents = function _firePendingPostChangeViewEvents(delay){
		// cancel schedule as firing event shortly!
		if(this._postChangeViewTimer){
			clearTimeout(this._postChangeViewTimer);
			this._postChangeViewTimer = null;
		}
		if(delay){
			if(delay < this.moveRefreshDelay){
				// schedule non-deferrable event
				setTimeout(function(){ // this is non-deferrable
					this._firePendingPostChangeViewEvents(); // fire now
				}.bind(this), delay);
			}else{
				this._onMapViewChange(); // delegate to normal one
			}
		}else{
			// finally fire event!
			var size = this.map.getSize();
			if(!size){
				console.warn('failed to get size from map. skipping post change view event.');
				return;
			}
			// wait for map's handling layous, and then send extent event
			setTimeout((function(){
				var ext = this.map.getView().calculateExtent(size);
				var extent = ol.proj.transformExtent(ext, 'EPSG:3857', 'EPSG:4326');
				if(this._postChangeViewLastExtent != extent){
					console.log('Invoking map extent change event', extent);
					this.postChangeViewHandlers.forEach(function(handler){
						handler(extent);
					});
					this._postChangeViewLastExtent = extent;
				}
			}).bind(this),100); 
		}
	};	
	
	/**
	 * Add popover to the map
	 * @options
	 *     options.elm: (required) the popover DOM element, which is a child of the map base element
	 *     options.pin: true to enable "pin" capability on the popover. with it, the popover is pinned by
	 *                  clicking on a target feature
	 *     options.updateInterval: interval time in millisec for updating popover content
	 * @showPopOver a function called on showing popover: function(elm, feature, pinned)
	 * @destroyPopOver a function called on dismissing the popover: function(elm, feature, pinned)
	 *   where @elm is the `elm` given as the first parameter to this method,
	 *         @feature is ol.Feature, @pinned is boolean showing the "pin" state (true is pinned)
	 * @pdatePopOver a function called on updating popover content: function(elm, feature, pinned)
	 */
	MapHelper.prototype.addPopOver = function addPopOver(options, showPopOver, destroyPopOver, updatePopOver){
		// check and normalize arguments
		var elm = options.elm;
		if(!options.elm){
			console.error('Missing popup target element. Skipped to setup popover.');
		}
		var nop = function(){};
		showPopOver = showPopOver || nop;
		destroyPopOver = destroyPopOver || nop;
		
		// control variables
		var currentPopoverFeature;
		var currentPinned;
		var startUpdateTimer, stopUpdateTimer; // implemented in section below
		
		// create popover objects
		var overlay = new ol.Overlay({
			element: elm,
			offset: [2,-3],
			positioning: 'center-right',
			stopEvent: true
		});
		this.map.addOverlay(overlay);
		
		//
		// Implement mouse hover popover
		//
		this.map.on('pointermove', (function(event){
			// handle dragging
			if(event.dragging){
				if(currentPinned)
					return; // don't follow pointer when pinned
				
				stopUpdateTimer();
				destroyPopOver(elm, currentPopoverFeature);
				currentPopoverFeature = null;
				return;
			}
			
			var feature = this.map.forEachFeatureAtPixel(event.pixel, function(feature, layer){
				return feature;
			});
			this.map.getTargetElement().style.cursor = (feature ? 'pointer' : ''); // cursor
			
			// guard by pin state
			if(currentPinned)
				return; // don't follow pointer when pinned
			
			if(feature)
				overlay.setPosition(event.coordinate);
			
			if(currentPopoverFeature !== feature){
				stopUpdateTimer();
				destroyPopOver(elm, currentPopoverFeature);
				currentPopoverFeature = feature;
				showPopOver(elm, currentPopoverFeature);
				startUpdateTimer();
			}
			
		}).bind(this));
		
		//
		// Implement "pin" capability on the popover
		//
		if(options.pin){
			var trackGeometryListener = function(){
				var coord = currentPopoverFeature.getGeometry().getCoordinates();
				overlay.setPosition(coord);
			};
			var closePinnedPopover = (function closeFunc(){
				stopUpdateTimer();
				destroyPopOver(elm, currentPopoverFeature, currentPinned);
				if(currentPopoverFeature)
					currentPopoverFeature.un('change:geometry', trackGeometryListener);
				currentPinned = false;
			}).bind(this);
			var showPinnedPopover = (function showFunc(){
				currentPinned = true;
				showPopOver(elm, currentPopoverFeature, currentPinned, closePinnedPopover);
				startUpdateTimer();
				if(currentPopoverFeature)
					currentPopoverFeature.on('change:geometry', trackGeometryListener);
			}).bind(this);
			
			this.map.on('singleclick', (function(event){
				var feature = this.map.forEachFeatureAtPixel(event.pixel, function(feature, layer){
					return feature;
				});
				if(!feature) return; // pin feature only works on clicking on a feature
				
				if(!currentPinned && feature === currentPopoverFeature){
					// Pin currently shown popover
					closePinnedPopover();
					showPinnedPopover();
				}else if(!currentPinned && feature !== currentPopoverFeature){
					// Show pinned popover
					var coord = feature.getGeometry().getCoordinates();
					overlay.setPosition(coord);
					// show popover
					currentPopoverFeature = feature;
					showPinnedPopover();
				}else if(currentPinned && currentPopoverFeature !== feature){
					// Change pinned target feature
					closePinnedPopover();
					currentPopoverFeature = feature;
					// move
					var coord = feature.getGeometry().getCoordinates();
					overlay.setPosition(coord);
					// show
					showPinnedPopover();
				}else if(currentPinned && feature === currentPopoverFeature){
					// Remove pin
					closePinnedPopover();
					//currentPopoverFeature = null;
					//showPopOver(elm, currentPopoverFeature, pinned); // to clear
				}
			}).bind(this));
		}
		
		//
		// Implement periodical content update option
		//
		if(options.updateInterval && updatePopOver){
			var timer = 0;
			startUpdateTimer = function(){
				stopUpdateTimer();
				timer = setTimeout(callUpdate, options.updateInterval);
			};
			stopUpdateTimer = function(){
				if(timer){
					clearTimeout(timer);
					timer = 0;
				}
			};
			var callUpdate = function(){
				updatePopOver(elm, currentPopoverFeature, currentPinned);
				timer = setTimeout(callUpdate, options.updateInterval);
			};
		}else {
			startUpdateTimer = function(){}; // nop
			stopUpdateTimer = function(){}; // nop
		}
		
	};
	
	/**
	 * Install workaorund for map size issue.
	 * Sometimes, OpenLayer's map canvas size and the underlying DIV element's size
	 * wont be synced. It causes inconsistency in conversion from screen pixcel to
	 * map coordinates and it hits mouse cursor-involved features such as popover.
	 * 
	 * So, this function does the followings:
	 * - force update map size after resizing browser, and
	 * - force update map size after tow seconds this function is called.
	 *   - this is required on initial loading in Firefox as its div resizing timing
	 *     seems different from others
	 * 
	 * Ideally, we should directly track the size of the DIV, but not here yet
	 */
	MapHelper.prototype.installMapSizeWorkaround = function(){
		// - capture resize event
		if(!this._scheduleUpdateSize){
			var this_ = this;
			var scheduleUpdateSizeTimer = 0; // always refers to this scope form the function
			this._scheduleUpdateSize = function(timeout) {
				return function(){
					if(scheduleUpdateSizeTimer){
						clearTimeout(scheduleUpdateSizeTimer);
					}
					scheduleUpdateSizeTimer = setTimeout(function(){ 
						this_.map.updateSize();
						scheduleUpdateSizeTimer = 0;
					}, timeout);
				};
			};
			if(window.addEventListener){
				window.addEventListener('resize', this._scheduleUpdateSize(200));
				window.addEventListener('orientationchange', this._scheduleUpdateSize(1000));
			}
		}
		this._scheduleUpdateSize(1000)(); // WORKAROUND: map's canvas and div sizees don't sync in Firefox
	};
	
	/***************************************************************
	 * Utility Functions 
	 */
	
	/**
	 * Expand the given extent by the ratio.
	 * - With ration 0.5, expand each side of the region by half width/height of the region
	 *   Thus, the result's width and height are twice as the given extent
	 */
	var expandExtent = function(extent, ratio){
		// draw real-time location of cars
		var min_lng0 = extent[0];
		var min_lat0 = extent[1];
		var max_lng0 = extent[2];
		var max_lat0 = extent[3];
		var min_lng = min_lng0 - (max_lng0 - min_lng0) * ratio;
		var min_lat = min_lat0 - (max_lat0 - min_lat0) * ratio;
		var max_lng = max_lng0 + (max_lng0 - min_lng0) * ratio;
		var max_lat = max_lat0 + (max_lat0 - min_lat0) * ratio;
		return [min_lng, min_lat, max_lng, max_lat];
	};
	
	/**
	 * Pre-load images for animation
	 * - When we do post-compose animation and trying to show styles with images, thay wont
	 *   be shown as the image might not be loaded during the animation. This is to work it
	 *   around.
	 * @map a map
	 * @styles a list of ol.style.Style -- non-image styles will be gracefully ignored
	 */
	var preloadStyles = function(map, styles){
		if(!styles || styles.length == 0) return;
		var center = new ol.geom.Point(map.getView().getCenter());
		var features = styles.map(function(style){
			if(style.image instanceof ol.style.Image){
				var feat = new ol.Feature({ geometry: center });
				feat.setStyle(style);
				return feat;
			}
		}).filter(function(feat){ return !!feat; });
		// create a layer
		var workaroundLayer = map._imageWorkaroundLayer;
		if(!workaroundLayer){
			workaroundLayer = new ol.layer.Vector({ source: new ol.source.Vector({})});
			map._imageWorkaroundLayer = workaroundLayer;
			map.addLayer(workaroundLayer);
			workaroundLayer.setOpacity(0.5); //TODO workaround layer opacity
		}
		workaroundLayer.getSource().addFeatures(features);
		// try to render the images
		workaroundLayer.setVisible(true);
		setTimeout(function(){
			workaroundLayer.setVisible(false);
		}, 100);
	};
	
	/***************************************************************
	 * Style Utility Functions 
	 */
	
	/**
	 * Get car style for the given status
	 * @return ol.style.Style
	 */
	var getCarStyle = function(status){
		return CAR_STYLE_MAP[status] || CAR_STYLE_MAP['unknown'];
	};
	var CAR_STYLES = [];
	var CAR_STYLE_MAP = {};
	(function(){
		var data = [['in_use', 'img/car-blue.png'], 
		            ['available', 'img/car-green.png'], 
		            ['unavailable', 'img/car-red.png'], 
		            ['unknown', 'img/car-gray.png']];
		data.forEach(function(item){
			var status = item[0], icon = item[1];
			var style = new ol.style.Style({image: new ol.style.Icon({
				anchor: [16, 16],
				anchorXUnits: 'pixels',
				anchorYUnits: 'pixels',
				opacity: 1,
				scale: 0.8,
				src: icon,
				//imgSize: [32, 32],
			})});
			CAR_STYLES.push(style);
			CAR_STYLE_MAP[status] = style;
		});
	})();
	
	/**
	 * Get driver events' style on the map
	 */
	var getDrivingEventStyle = function(event){
		if(getDrivingEventStyle._cache)
			return getDrivingEventStyle._cache;
		
		getDrivingEventStyle._cache = new ol.style.Style({
			image: new ol.style.RegularShape({
				points: 3,
				radius: 9,
				rotation: 0,
				snapToPixel: false,
				fill: new ol.style.Fill({color: 'yellow'}),
				stroke: new ol.style.Stroke({
					color: 'black', width: 1
				}),
			}),
		});
		return getDrivingEventStyle._cache
	};

	
})((function(){
	// tweak to use script-relative path
	var scripts = document.getElementsByTagName('script');
	var scriptUrl = scripts[scripts.length - 1].src;
	return scriptUrl.substring(0, scriptUrl.lastIndexOf('/') + 1);
})());
