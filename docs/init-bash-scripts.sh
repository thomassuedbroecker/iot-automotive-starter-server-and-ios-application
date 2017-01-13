#!/bin/bash
# Information steps:
# 1) chmod u+x init-bash-scripts.sh
# 2) ./init-bash-scripts.sh

echo "--> Init all bash scripts"
echo "--> Init Git scripts"
chmod u+x git-commit.sh
chmod u+x git-setup-rebase.sh
chmod u+x git-create-version.sh

echo "--> Init Bluemix scripts"
chmod u+x push-and-log.sh
chmod u+x restage-and-log.sh
chmod u+x deploy_create_services.sh
chmod u+x push-setup.sh
chmod u+x init-sample-bluemix-cf-application.sh

echo "--> Init MobileApp script"
chmod u+x setup-ios-mobile-app

echo "--> Init bash scripts - Done!"
