/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-ADRVKF&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps
 *
 * You may not use this file except in compliance with the license.
 */
import UIKit
import BMSCore
import BMSPush

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?


    func application(application: UIApplication,
            didFinishLaunchingWithOptions launchOptions: [NSObject: AnyObject]?)
            -> Bool {
                
        UIApplication.sharedApplication().statusBarStyle = .LightContent
                
        if launchOptions != nil {
            let notification = launchOptions?[UIApplicationLaunchOptionsLocalNotificationKey] as! UILocalNotification!
            if notification != nil {
                handleReservationNotification(notification)
            }
        }
        return true
    }
    func application(application: UIApplication, didReceiveLocalNotification notification: UILocalNotification){
        print("didReceiveLocalNotification")
        handleReservationNotification(notification)
    }
    func application(application: UIApplication, didReceiveRemoteNotification userInfo: [NSObject : AnyObject], fetchCompletionHandler completionHandler: (UIBackgroundFetchResult) -> Void) {
        print("didReceiveRemoteNotification")
        if let aps = userInfo["aps"] as? NSDictionary {
            if let alert = aps["alert"] as? NSDictionary {
                if let body = alert["body"] as? String {
                    ReservationUtils.showReservationAlert("OK", description: body, handler: {(action:UIAlertAction)->Void in
                        // do nothing
                    })
                }else{
                    ReservationUtils.showReservationAlert("OK", description: "Weather becomes bad", handler: {(action:UIAlertAction)->Void in
                        // do nothing
                    })
                }
            }
        }
    }
    func application (application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: NSData){
        let push = BMSPushClient.sharedInstance
        print("Register Device Token: \(deviceToken)")
        push.registerWithDeviceToken(deviceToken){(response, statusCode, error) -> Void in
            if error.isEmpty{
                print("Response during device registration: \(response)")
                print("status code during device registration: \(statusCode)")
            }else{
                print("Error during device registration \n - status code: \(statusCode) \n Error: \(error)")
            }
        }
    }
    func application(application: UIApplication, handleActionWithIdentifier identifier: String?, forLocalNotification notification: UILocalNotification, completionHandler: ()->Void){
        print("handleActionWithIdentifier forLocalNotification")
        switch(identifier!){
        case NotificationUtils.ACTION_OPEN_RESERVATION:
            handleReservationNotification(notification)
        case NotificationUtils.ACTION_OK:
            // do nothing
            break
        default:
            break
        }
    }
    func application(application: UIApplication, handleActionWithIdentifier identifier: String?, forRemoteNotification userInfo: [NSObject : AnyObject], completionHandler: (() -> Void)) {
        switch(identifier!){
        case NotificationUtils.ACTION_OPEN_RESERVATION:
            let strPayload = userInfo["payload"] as! String
            do{
                let payload = try NSJSONSerialization.JSONObjectWithData(strPayload.dataUsingEncoding(NSUTF8StringEncoding)!, options: .MutableContainers) as! NSMutableDictionary
                let reservationId = payload["reservationId"] as! String
                ReservationUtils.showReservationPage(reservationId)
            }catch{
                print("payload of remote notification cannot be parsed")
                print(" - \(strPayload)")
            }
        case NotificationUtils.ACTION_OK:
            // do nothing
            break
        default:
            break;
        }
        completionHandler()
    }
    func handleReservationNotification(notification:UILocalNotification){
        let userInfo = notification.userInfo as! [String: String]
        let handler = {(action:UIAlertAction)->Void in
            let reservationId = userInfo["reservationId"]!
            ReservationUtils.showReservationPage(reservationId)
            UIApplication.sharedApplication().cancelLocalNotification(notification)
        }
        switch UIApplication.sharedApplication().applicationState{
        case .Active:
            //Work around for iOS10
            let label = (notification.alertAction != nil) ? notification.alertAction! : "OK"
            ReservationUtils.showReservationAlert(label, description:notification.alertBody!, handler: handler)
        case .Inactive:
            let appRoute = userInfo[USER_DEFAULTS_KEY_APP_ROUTE]!
            let pushAppGuid = userInfo[USER_DEFAULTS_KEY_PUSH_APP_GUID]!
            let pushClientSecret = userInfo[USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET]!
            let mcaTenantId = userInfo[USER_DEFAULTS_KEY_MCA_TENANT_ID]!
            specifyServer(appRoute, pushAppGuid: pushAppGuid, pushClientSecret: pushClientSecret, mcaTenantId: mcaTenantId)
            NotificationUtils.cancelNotification(userInfo)
            fallthrough
        case .Background:
            handler(UIAlertAction())
        }
    }
    func specifyServer(appRoute:String, pushAppGuid:String, pushClientSecret:String, mcaTenantId:String){
        let userDefaults = NSUserDefaults.standardUserDefaults()
        if appRoute != "" {
            userDefaults.setValue(appRoute, forKey: USER_DEFAULTS_KEY_APP_ROUTE)
            userDefaults.setValue(pushAppGuid, forKey: USER_DEFAULTS_KEY_PUSH_APP_GUID)
            userDefaults.setValue(pushClientSecret, forKey: USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET)
            userDefaults.setValue(mcaTenantId, forKey: USER_DEFAULTS_KEY_MCA_TENANT_ID)
        }
        userDefaults.synchronize()
        self.window?.rootViewController?.childViewControllers[0].performSegueWithIdentifier("showHomeTab", sender: self)
    }
}

