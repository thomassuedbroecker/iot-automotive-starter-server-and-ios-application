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

class ReservationUtils {
    static let TAB_INDEX_RESERVATION = 1
    static let DEFAULT_PICKUP_TIME_OFFSET:Double = 60*30 // After 20-30 minutes since now
    static let DEFAULT_DROPOFF_TIME_OFFSET:Double = 60*150 // 2 hours reservation
    static let PICKUP_NOTIFICATION_BEFORE:Double = 60*30 // 30 minutes
    static let DROPOFF_NOTIFICATION_BEFORE:Double = 60*30 // 30 minutes


    private init(){}
    
    static func getReservation(reservationId:String, callback:(reservation:ReservationsData)->Void){
        let url = NSURL(string:"\(API.reservation)/\(reservationId)")
        let request = NSMutableURLRequest(URL:url!)
        request.HTTPMethod = "GET"
        API.doRequest(request, callback: {(response, jsonArray)->Void in
            let reservations = ReservationsData.fromDictionary(jsonArray)
            if reservations.count == 1 {
                let reservation = reservations[0]
                callback(reservation: reservation)
            }
        })
    }
    static func resetReservationNotifications(){
        let url = NSURL(string: API.reservations)!
        let request = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "GET"
        
        API.doRequest(request) { (response, jsonArray) -> Void in
            let app = UIApplication.sharedApplication()
            app.cancelAllLocalNotifications()
            let reservations = ReservationsData.fromDictionary(jsonArray)
            if reservations.count > 0 {
                for reservation in reservations {
                    if(reservation.status == "active"){
                        ReservationUtils.setPickupNotification(reservation)
                    }else if(reservation.status == "driving"){
                        ReservationUtils.setDropoffNotification(reservation)
                    }
                }
            }
        }
    }
    static func showReservationAlert(label:String, description:String, handler:(action:UIAlertAction)->Void){
        let action = UIAlertAction(title:label, style:.Default, handler:handler)
        NotificationUtils.showAlert(description, action: action)
    }
    static func showReservationPage(reservationId:String){
        ReservationUtils.getReservation(reservationId, callback:{(reservation)->Void in
            dispatch_async(dispatch_get_main_queue(), {
                // Need to modify layout in main thread
                let window = UIApplication.sharedApplication().keyWindow
                // Assume first tabbarcontroller is main ui
                for vc in (window?.rootViewController?.childViewControllers)! {
                    if let tabBarController = vc as? UITabBarController {
                        tabBarController.navigationController?.popToViewController(tabBarController, animated: true)
                        tabBarController.selectedIndex = TAB_INDEX_RESERVATION
                        if reservation.carDetails != nil {
                            let reservationsVC = tabBarController.selectedViewController as! ReservationsViewController
                            reservationsVC.performSegueWithIdentifier("editReservationSegue", sender: reservation)
                        }
                        break
                    }
                }
            })
        })
    }
    static func setPickupNotification(reservation:ReservationsData){
        let pickupTime = NSDate(timeIntervalSince1970:reservation.pickupTime!)
        let cal = NSCalendar(identifier:NSCalendarIdentifierGregorian)
        let result = cal?.compareDate(NSDate(timeIntervalSinceNow:ReservationUtils.PICKUP_NOTIFICATION_BEFORE), toDate: pickupTime, toUnitGranularity: .Second)
        var notifyAt:NSDate
        if result == NSComparisonResult.OrderedDescending {
            notifyAt = NSDate(timeIntervalSinceNow: 20)
        }else{
            notifyAt = NSDate(timeIntervalSince1970:reservation.pickupTime! - ReservationUtils.PICKUP_NOTIFICATION_BEFORE)
        }
        NotificationUtils.setNotification(
            notifyAt,
            message: "Pick-up reminder. You are \(Int(ReservationUtils.PICKUP_NOTIFICATION_BEFORE/60)) minutes away from your car pick-up time.",
            actionLabel: "Open",
            userInfo: [
                "reservationId": reservation._id!,
                "type":"pickup",
                USER_DEFAULTS_KEY_APP_ROUTE: API.connectedAppURL,
                USER_DEFAULTS_KEY_PUSH_APP_GUID: API.connectedPushAppGUID,
                USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET: API.connectedPushClientSecret,
                USER_DEFAULTS_KEY_MCA_TENANT_ID: API.connectedMcaTenantId
            ])
    }
    static func setDropoffNotification(reservation:ReservationsData){
        let dropOffTime = NSDate(timeIntervalSince1970:(reservation.dropOffTime)!)
        let cal = NSCalendar(identifier: NSCalendarIdentifierGregorian)
        let result = cal?.compareDate(NSDate(timeIntervalSinceNow:ReservationUtils.DROPOFF_NOTIFICATION_BEFORE), toDate: dropOffTime, toUnitGranularity: .Second)
        var notifyAt:NSDate
        if result == NSComparisonResult.OrderedDescending {
            notifyAt = NSDate(timeIntervalSinceNow: 20)
        }else{
            notifyAt = NSDate(timeIntervalSince1970:(reservation.dropOffTime)! - ReservationUtils.DROPOFF_NOTIFICATION_BEFORE)
        }
        NotificationUtils.setNotification(
            notifyAt,
            message: "Drop-off reminder. You are \(Int(ReservationUtils.DROPOFF_NOTIFICATION_BEFORE/60)) minutes away from your car drop-off time.",
            actionLabel: "Open",
            userInfo: [
                "reservationId":reservation._id!,
                "type":"dropoff",
                USER_DEFAULTS_KEY_APP_ROUTE: API.connectedAppURL,
                USER_DEFAULTS_KEY_PUSH_APP_GUID: API.connectedPushAppGUID,
                USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET: API.connectedPushClientSecret,
                USER_DEFAULTS_KEY_MCA_TENANT_ID: API.connectedMcaTenantId
            ])
        
    }
}
