/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-ADRVKF&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps
 *
 * You may not use this file except in compliance with the license.
 */
import Foundation
import UIKit
import BMSCore
import BMSPush
import UserNotifications

class NotificationUtils{
    fileprivate init(){}
    static let ALERT_TITLE = "IoT Automotive Car Sharing"
    static let ACTION_OPEN_RESERVATION = "ACTION_OPEN_RESERVATION"
    static let ACTION_OK = "ACTION_OK"
    static let CATEGORY_OPEN_RESERVATION = "CATEGORY_OPEN_RESERVATION"
    static let CATEGORY_OK = "CATEGORY_OK"

    static func setNotification(_ notifyAt:Date, message:String, actionLabel:String, userInfo: [AnyHashable: Any]){
        let calendar = Calendar(identifier:Calendar.Identifier.gregorian)
        let result = (calendar as NSCalendar?)?.compare(Date(), to: notifyAt, toUnitGranularity: .second)
        if result == ComparisonResult.orderedDescending {
               return
        }
        let notification = UILocalNotification()
        notification.timeZone = TimeZone.current
        notification.fireDate = notifyAt
        notification.alertBody = message
        notification.alertAction = actionLabel
        notification.category = NotificationUtils.CATEGORY_OPEN_RESERVATION
        notification.userInfo = userInfo
        UIApplication.shared.scheduleLocalNotification(notification)
    }
    static func cancelNotification(_ userInfo:Dictionary<String, String>){
        for notification in UIApplication.shared.scheduledLocalNotifications! {
            if(notification.userInfo != nil && NSDictionary(dictionary: notification.userInfo!).isEqual(to: userInfo)){
                UIApplication.shared.cancelLocalNotification(notification)
                return
            }
        }
    }
    static func showAlert(_ description:String, action: UIAlertAction){
        let window = UIApplication.shared.keyWindow
        let alert = UIAlertController(title: NotificationUtils.ALERT_TITLE, message: description, preferredStyle: .alert)
        alert.addAction(action)
        window?.rootViewController?.present(alert, animated: true, completion: nil)
    }
    static func initRemoteNotification(){
        let bmsClient = BMSClient.sharedInstance
        bmsClient.initialize(bluemixRegion: API.bmRegion)
        bmsClient.requestTimeout = 10.0
        
        let push = BMSPushClient.sharedInstance
        push.initializeWithAppGUID(appGUID: API.connectedPushAppGUID, clientSecret: API.connectedPushClientSecret)

        let openReservationAction = UIMutableUserNotificationAction()
        openReservationAction.identifier = ACTION_OPEN_RESERVATION
        openReservationAction.title = "Open"
        openReservationAction.activationMode = .foreground
        openReservationAction.isDestructive = false
        openReservationAction.isAuthenticationRequired = true
        
        let okAction = UIMutableUserNotificationAction()
        okAction.identifier = ACTION_OK
        okAction.title = "OK"
        okAction.activationMode = .background
        okAction.isDestructive = false
        okAction.isAuthenticationRequired = false
        
        let openReservationCategory = UIMutableUserNotificationCategory()
        openReservationCategory.identifier = CATEGORY_OPEN_RESERVATION
        openReservationCategory.setActions([openReservationAction, okAction], for: .minimal)
        
        let okCategory = UIMutableUserNotificationCategory()
        okCategory.identifier = CATEGORY_OK
        okCategory.setActions([okAction], for: .minimal)

        if #available(iOS 10.0, *) {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            {(granted, error) in
                UIApplication.shared.registerForRemoteNotifications()
            }
        } else {
            UIApplication.shared.registerUserNotificationSettings(UIUserNotificationSettings(types: [.sound, .alert, .badge], categories: Set([openReservationCategory, okCategory])))
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
    static func getDeviceId() -> String?{
        let authManager  = BMSClient.sharedInstance.authorizationManager
        let devId = authManager.deviceIdentity.ID
        return devId
    }
}
