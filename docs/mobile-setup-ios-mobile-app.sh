#!/bin/bash
# Information steps:
# 1) chmod u+x setup-ios-mobile-app.sh
# 2) ./setup-ios-mobile-app.sh

echo "--> Start setup ios-mobile-app"
cd ..
cd mobile-app-ios-carsharing

echo "-> Install cocoapods"
sudo gem install cocoapods

echo "-> do Pod install for the xCode Workspace"
pod install

echo "-> Open the Swift xCode Workspace"
open MobileStarterApp.xcworkspace

echo "--> setup ios-mobile-app - DONE!"
