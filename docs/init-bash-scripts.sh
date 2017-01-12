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
chmod u+x start-sample.sh

echo "--> Init extra scripts"
echo "--> ../public/bin"
cd ..
cd public/bin

chmod u+x browserify.sh
# chmod u+x start-selenium.sh
# chmod u+x watchify.sh

echo "--> Init bash scripts - Done!"
