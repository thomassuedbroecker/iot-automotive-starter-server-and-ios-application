#!/bin/bash
# Information steps:
# 1) chmod u+x bm-deploy_create_services.sh
# 2) ./bm-deploy_create_services.sh
# cf api https://api.eu-gb.bluemix.net UK
# cf api https://api.ng.bluemix.net US

user="<bluemix-id>"
# bluemix_api="https://api.eu-gb.bluemix.net"
bluemix_api="https://api.ng.bluemix.net"
organization_name="<bluemix-organization-name>"
space_name="<bluemix-space-name>"
application_name="<bluemix-application-name>"

echo "User: '$user' API: '$bluemix_api'"
echo "Organization: '$organization_name'"
echo "Space: '$space_name'"

echo "Insert your password:"
# How to input a password in bash shell
# http://stackoverflow.com/questions/3980668/how-to-get-a-password-from-a-shell-script-without-echoing
read -s password
cd ..
cf login -a $bluemix_api -u $user -p $password -o $organization_name -s $space_name


echo "--> Start - Create Bluemix Service"

echo "-> Bluemix Services: Backend Server Related"
echo "-> iotf-service "
cf create-service iotf-service iotf-service-free iot-automotive-IoTPlatform
echo "-> cloudantNoSQLDB "
cf create-service cloudantNoSQLDB Lite  iot-automotive-MobilityDB
echo "-> mapinsights "
cf create-service mapinsights free  iot-automotive-ContextMapping
echo "-> driverinsights "
cf create-service driverinsights free  iot-automotive-DriverBehavior
echo "-> weatherinsights "
cf create-service weatherinsights Free-v2  iot-automotive-WeatherInsights
echo "-> Bluemix Services: Backend Server Related - DONE!"

echo "-> Bluemix Services: MobileApp Related"
echo "-> AdvancedMobileAccess"
cf create-service AdvancedMobileAccess Gold  iot-automotive-AdvancedMobileAccess
echo "-> imfpush"
cf create-service imfpush Basic  iot-automotive-PushNotifications
echo "-> Bluemix Services: MobileApp Related - DONE!"

echo "--> Create Bluemix Service - DONE!"
