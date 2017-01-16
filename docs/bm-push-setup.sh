#!/bin/bash
# Information steps:
# 1) chmod u+x bm-push-setup.sh
# 2) ./bm-push-setup.sh
# cf api https://api.eu-gb.bluemix.net UK
# cf api https://api.ng.bluemix.net US

echo "--> Ensure to deploy into the right bluemix region"
echo "-> Start setup"

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

echo "--> Starting push $application_name"
cf spaces
echo "****** show existing apps *********"
cf apps
echo "******* push $application_name to Bluemix ********"
cf push  $application_name --no-start
echo "******* Create Custom Environment Variable ********"
echo "->Set ADMIN USER and PASSWORD"
echo "->Choose a administration user:"
read -s $user
cf set-env $application_name ADMIN_USER $user
echo "->Choose a administration user password:"
read -s $password
cf set-env $application_name ADMIN_PASSWORD $password
echo "->Disable MCA_AUTHENTICATION"
cf set-env $application_name MCA_AUTHENTICATION false
echo "->Do not enable DISABLE_DEMO_CAR_DEVICES"
cf set-env $application_name DISABLE_DEMO_CAR_DEVICES false
echo ""
echo "***************"
echo "Now you must:"
echo ""
echo "Activating the bluemix services"
echo "Before you can use the application you must activate the Context Mapping and Driver Behavior services on Bluemix, as outlined in the following steps:"
echo "Make sure that the app is not running on Bluemix."
echo " 1-Open the Bluemix dashboard in your browser."
echo " 2-Open the Context Mapping service and wait for a few seconds until your credentials display."
echo " 3-Open the Driver Behavior service."
echo ""
echo "Did you finish this tasks: Y/N"
read answer
if [ $answer == 'Y' ]
then
   echo "OK fine, now you are ready to do the next step!"
   echo "******* restage $application_name ********"
   cf restage  $application_name
   echo "-> DONE!"
   echo "-> First Setup is DONE!"
   echo "-> There are remaining steps to do!"
else
  echo "-> Setup FAILED!"
  echo "-> Best is to delete the application and services and run the setup once more."
fi
