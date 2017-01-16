#!/bin/bash
# Information steps:
# 1) chmod u+x init-sample-bluemix-cf-application.sh
# 2) ./init-sample-bluemix-cf-application.sh

echo "*********************************************"
echo "--> This script will create the needed Bluemix Services and the Bluemix CF Node JS Application"
echo "-> Start Setup IoT for Automotive Sample"
echo ""
echo "-> Step 1: Start creating the Bluemix Services"
./bm-deploy_create_services.sh
echo "-> Step 2: Start deploy the CF Application to Bluemix"
./bm-push-setup.sh
echo ""
echo "--> Setup IoT for Automotive Sample - DONE!"
echo "*********************************************"
