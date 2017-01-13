# IBM IoT for Automotive - Mobility Starter Application mobile app for iOS

## Overview
The IBM IoT for Automotive - Mobility Starter Application uses the **Context Mapping** and **Driver Behavior** services that are available on **IBM Bluemix** to help you to quickly build a smart car-sharing automotive solution. The IBM IoT for Automotive - Mobility Starter Application consists of a mobile app and a server component.

### Mobile app
The starter app provides a mobile app for customers to quickly find and hire a car without human intervention from a car-hire company. If you are a car-hire customer, you can use the mobile app to do the following tasks:

- Search for available cars by location on a GIS map
- Search for available cars that meet your specific requirements
- Reserve a car 
- Unlock the car that you just hired and start driving the car
 
While you drive the car, the service tracks your location and also records your driving behavior. When you reach your driving destination, you can view information about each trip that you took in the car and you can also view your driving behavior score.

### Server component
The IoT for Automotive - Mobility Starter Application mobile app interacts with the server component. The server component provides the back-end car sharing and system monitoring service that provides more features for car-hire companies. By default, the mobile app connects to a test server that is provided by IBM. You can also choose to deploy your own server instance to IBM Bluemix and connect your mobile app to that instance instead of the test system. For more information about deploying the car-sharing server component, see [ibm-watson-iot/iota-starter-server](https://github.com/ibm-watson-iot/iota-starter-server).

## Prerequisites

Before you deploy the IoT for Automotive - Mobility Starter Application mobile app for iOS, ensure that the following prerequisites are met:

- The sample source code for the mobile app is only supported for use with an official Apple iOS device.
- The sample source code for the mobile app is also supported only with officially licensed Apple development tools that are customized and distributed under the terms and conditions of your licensed Apple iOS Developer Program or your licensed Apple iOS Enterprise Program.
- Apple Xcode 8.0 integrated development environment (IDE) and [CocoaPods](https://cocoapods.org/) must be installed on the computer that you plan to clone the mobile app source repository onto.

## Deploying the mobile app

You can download and install the mobile app on iOS and Android mobile devices. For more information about trying the Android version of the mobile app, see [IBM IoT for Automotive - Mobility Starter Application mobile app for Android](https://github.com/ibm-watson-iot/iota-starter-carsharing-android).

To try the IoT for Automotive - Mobility Starter Application mobile app for iOS with iOS Simulator, complete the following steps:

1. Open a Terminal session and install CocoaPods by using the following command:   
```$ sudo gem install cocoapods```    
2. Clone the Mobility Starter Application source code repository for the sample mobile app by using the following git command:  
```$ git clone https://github.com/ibm-watson-iot/iota-starter-carsharing```   
3. Go to your Mobility Starter Application project folder, and then enter the following commands:   
```$ pod install```  
```$ open MobileStarterApp.xcworkspace```

4. Edit the **API.swift file**, and set the `defaultAppURL` property to the URL for your IoT for Automotive - Mobility Starter Application server app.

5. Go to the upper left of the Xcode UI, click **Run**.

6. To deploy the mobile app on your device, see [Launching Your App on Devices](https://developer.apple.com/library/content/documentation/IDEs/Conceptual/AppDistributionGuide/LaunchingYourApponDevices/LaunchingYourApponDevices.html).

7. Optional: If you would like to be notified about certain events, for example, severe weather at the pickup location, enable push notifications, as outlined in the next procedure.

To view a video recording that demonstrates how to complete the steps to deploy the mobile app, click play:

[![](XcodePreview.jpg)](https://www.youtube.com/watch?v=9O5uoPsn0LA "Instructions")  

### Setting up push notifications

You can optionally enable Apple Push Notifications (APN) to warn users about severe weather conditions that might be occurring at the drop off time and location of the car reservation.

To enable push notifications, complete the following steps:

1. Register your app ID for APNs on the [Apple Developer portal](https://developer.apple.com/).

2. Create an APN development SSL certificate.

3. Create an APN development provisioning profile.

4. Go to the Bluemix Push Notifications Dashboard and bind the APNs that you created to your server app.

5. Connect your iOS mobile device to your Apple Mac.

6. Change the bundle ID of the Xcode project to your app ID.

7. In Xcode, select your iOS device as the build target and press **Build and run**.

8. On the mobile app, tap **Specify Server**.

9. To start the camera function, tap the QR code image.

10. From a browser, connect to the server application and display the QR code:
  - If you are connecting your mobile app to the predeployed IBM test Mobility Starter Application server,  can find the QR code on the Starter Experience home page.
  - If you are connecting your mobile app to your own server instance, you can find the QR code for your server instance at the bottom of the following page: `https://<your-app-route>.mybluemix.net/`
  
11. Scan the QR code from your mobile app.

For more information, see [Push notifications](https://console.ng.bluemix.net/docs/services/mobilepush/t_push_provider_ios.html).

### Mobile Client Access service

The IoT for Automotive - Mobility Starter Application car sharing mobile app provides a simple demonstration of the Mobile Client Access service. The app logs in with the user name and password by using the  Mobile Client Access for custom authentication.

* [CustomAuthDelegate.swift](MobileStarterApp/CustomAuthDelegate.swift) onAuthenticationChallengeReceived()  
Call `submitAuthenticationChallengeAnswer()` with the user name and password that you entered in the login alert.

* [QRCodeReaderViewController.swift](MobileStarterApp/QRCodeReaderViewController.swift) configureVideoCapture()  
Set whether to use custom authentication for the `okAction` function.

* [API.swift](MobileStarterApp/API.swift) doInitialize()  
Initialize the Mobile Client Access client SDK.

For more information, see [Configuring the Mobile Client Access client SDK for iOS](https://console.ng.bluemix.net/docs/services/mobileaccess/custom-auth-ios-swift-sdk.html).

You also need to add and configure Mobile Client Access for custom authentication on the IoT for Automotive - Mobility Starter Application server. For more information, see [IoT for Automotive - Mobility Starter Application server]( https://github.com/ibm-watson-iot/iota-starter-server).

## Reporting defects
To report a defect with the IoT for Automotive - Mobility Starter Application mobile app, go to the [Issues](https://github.com/ibm-watson-iot/iota-starter-carsharing/issues) section.

## Privacy notice
The IoT for Automotive - Mobility Starter Application on Bluemix stores all of the driving data that is obtained while you use the mobile app.

## Apple Developer Program License Notice

IBM is delivering this sample source code for IoT for Automotive Starter Mobile Application to Client for further development, build and test. Client understands and confirms that further development (whether performed by the Client or by IBM acting on the Client's behalf) is undertaken under the Client's Apple Developer Program or Apple Developer Enterprise Program Agreement. The Client confirms that they have all appropriate Apple Developer Program license(s) and that the Client, as Apple's licensee, is subject to, and will comply with, the terms of the appropriate Apple Developer Program Agreement.

## Useful links

- [IBM IoT for Automotive](http://www.ibm.com/internet-of-things/iot-industry/iot-automotive)
- [IBM Watson Internet of Things](http://www.ibm.com/internet-of-things/)  
- [IBM Watson IoT Platform](http://www.ibm.com/internet-of-things/iot-solutions/watson-iot-platform/)   
- [IBM Watson IoT Platform Developers Community](https://developer.ibm.com/iotplatform/)
- [IBM Bluemix](https://bluemix.net/)  
- [IBM Bluemix documentation](https://www.ng.bluemix.net/docs/)  
- [IBM Bluemix developers community](http://developer.ibm.com/bluemix)  
