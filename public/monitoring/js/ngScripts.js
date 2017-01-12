/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
angular.module('systemMonitoring', ['ui.router', 'ngAnimate', 'devices'])

    /* === APP CONFIG === */
    .config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {
      
      $stateProvider
      .state('users', {
        url: '/users',
        templateUrl: 'partials/users/users.html',
        controller:  'usersCtrl'
      })
      .state('map', {
        url: '/map',
        templateUrl: 'partials/map/map.html',
        controller:  'mapCtrl'
      })
      .state('vehicle', {
        url: '/vehicle',
        templateUrl: 'partials/vehicle/vehicle.html',
        controller:  'vehicleCtrl'
      })
      .state('settings', {
        url: '/settings',
        templateUrl: 'partials/settings/settings.html',
        controller:  'settingsCtrl'
      })
      $urlRouterProvider.otherwise('/map');
      
    }])

    .run(['$rootScope', '$state', function($rootScope, $state) {
        $rootScope.$on('$stateChangeStart', function(evt, to, params) {
          if (to.redirectTo) {
            evt.preventDefault();
            $state.go(to.redirectTo, params, {location: 'replace'})
          }
        });
    }])
    
    /* === GENERAL CONTROLLERS === */
    .controller('sidebar', ['$scope', '$state', function($scope, $state) {
       $scope.sidebarItems = [
           { title: "Map", route: "map", icon: 'icon-location', active: false },
           { title: 'Users', route: 'users', icon: 'icon-user', active: false},
           { title: "Vehicle", route: "vehicle", icon: 'icon-car', active: false },
           { title: "Settings", route: "settings", icon: 'icon-manage', active: false }
       ];
       
       $scope.isActive = function() {  
           return $state.includes('overview');
       }
    }])
    
    .controller('mapCtrl', ['$rootScope', '$scope', function($rootScope, $scope) {
        var self = this;
        $scope.onChangeMapExtent = function(extent){
            $rootScope.mapLastSelectedArea = {id:'_last_selected', name: 'Last Selected', extent: extent};
            $scope.selectedRegion = {id: 'user_'+new Date(), name: 'User Defined', extent: extent};
        };
        
        //
        // Area is for focusing on a small region. 
        // - to set location, `center` (and `zoom`) or `extent` property
        //   - the default zoom value is 15
        //
        $scope.areas = [
          {id: 'vegas1'  , name: 'MGM Grand, Las Vegas', center:  [-115.165571,36.102118]},
          {id: 'vegas2' ,name: 'Mandalay Bay, Las Vegas', center:  [-115.176670,36.090754]},
          {id: 'munch1'  ,name: 'Hellabrunn Zoo, Munich', center:  [11.55848,48.0993]},
          {id: 'munch2'  ,name: 'Nymphenburg Palace, Munich', center:  [11.553583,48.176656]},
          {id: 'tokyo1' ,name: 'Tokyo, Japan', center:  [139.731992,35.709026]},
        ];
        if(navigator.geolocation){
            var fSelectNearestLocation = !$rootScope.mapLastSelectedArea;
            navigator.geolocation.getCurrentPosition(function(pos){
                var current_center = [pos.coords.longitude, pos.coords.latitude];
                $scope.areas.push({
                    id: '_current',
                    name: 'Current Location',
                    center: current_center});
                if(fSelectNearestLocation){
                    // when the location is not "last selected", re-select the map location depending on the current location
                    var nearest = _.min($scope.areas, function(area){
                        if((area.id && area.id.indexOf('_') === 0) || !area.center) return undefined;
                        // approximate distance by the projected map coordinate
                        var to_rad = function(deg){ return deg / 180 * Math.PI; };
                        var r = 6400;
                        var d_lat = Math.asin(Math.sin(to_rad(area.center[1] - current_center[1]))); // r(=1) * theta
                        var avg_lat = (area.center[1] + current_center[1]) / 2
                        var lng_diff = _.min([Math.abs(area.center[0] - current_center[0]), Math.abs(area.center[0] + 360 - current_center[0]), Math.abs(area.center[0] - 360 - current_center[0])]);
                        var d_lng = Math.cos(to_rad(avg_lat)) * to_rad(lng_diff); // r * theta
                        var d = Math.sqrt(d_lat * d_lat + d_lng * d_lng);
                        //console.log('Distance to %s is about %f km.', area.id, d * 6400);
                        return d;
                    });
                    if(nearest.id){
                        // when valid nearest is selected, set it
                        $scope.selectedArea = nearest;
                        $scope.$digest(); // notify to move fast
                    }
                }
            });
        }
        if($rootScope.mapLastSelectedArea){
            $scope.areas.push($rootScope.mapLastSelectedArea);
            $scope.selectedArea = $rootScope.mapLastSelectedArea;
        }else{
            $scope.selectedArea = $scope.areas[0];
        }
        
        //
        // Region is wider than area, e.g. to track the number of cars
        //
        $scope.regions = [
          {id: 'vegas'  ,name: 'Las Vegas', extent: [-116.26637642089848,35.86905016413695,-114.00868599121098,36.423521308323046]},
          {id: "munich" ,name: 'Munich, Germany', extent: [10.982384418945298,48.01255711693946,12.111229633789048,48.24171763772631]},
          {id: 'tokyo'  ,name: 'Tokyo, Japan', extent:  [139.03856214008624,35.53126066670448,140.16740735493002,35.81016922341598]},
          {id: "toronto",name: 'Toronto, Canada', extent: [-80.69297429492181,43.57305259767264,-78.43528386523431,44.06846938917488]},
        ];
        // make initial selection
        $scope.selectedRegion = $scope.regions[0];
    }])
    
    .controller('usersCtrl', ['$scope', function($scope, $state) {
        // empry
    }])

    .controller('vehicleCtrl', ['$scope', function($scope, $state) {
        // empty
    }])
;