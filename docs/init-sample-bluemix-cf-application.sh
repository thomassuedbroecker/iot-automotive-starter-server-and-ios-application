#!/bin/bash
# Information steps:
# 1) chmod u+x init-sample-bluemix-cf-application.sh
# 2) ./init-sample-bluemix-cf-application.sh

echo "--> This script will create the needed Bluemix Services and the Bluemix CF Node JS Application"
echo "-> Start Setup IoT for Automotive Sample"

echo "-> Start creating the Bluemix Services"
./deploy_create_services.sh
echo "-> Start deploy the CF App to Bluemix"
./push-setup.sh

echo "--> Setup IoT for Automotive Sample - DONE!"
