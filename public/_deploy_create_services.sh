#!/bin/bash 
cf create-service iotf-service iotf-service-free IoTPlatform
cf create-service cloudantNoSQLDB Lite MobilityDB
#cf create-service AdvancedMobileAccess Gold AdvancedMobileAccess
cf create-service mapinsights free ContextMapping
cf create-service driverinsights free DriverBehavior
cf create-service weatherinsights Free-v2 WeatherInsights
#cf create-service imfpush Basic PushNotifications
