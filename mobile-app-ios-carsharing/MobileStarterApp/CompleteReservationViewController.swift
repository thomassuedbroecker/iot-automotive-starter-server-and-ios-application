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
import CoreLocation

class CompleteReservationViewController: UIViewController {
    
    var reservation: ReservationsData? // set by ReservationsViewController

    @IBOutlet weak var changeReservationButton: UIButton!
    @IBOutlet weak var cancelReservationButton: UIButton!
    @IBOutlet weak var unlockButton: UIButton!
    
    @IBOutlet weak var pickUpLabel: UILabel!
    @IBOutlet weak var carNameLabel: UILabel!
    @IBOutlet weak var reservationDurationLabel: UILabel!
    @IBOutlet weak var platNumberLabel: UILabel!
    @IBOutlet weak var totalBillLabel: UILabel!
    @IBOutlet weak var locationButton: UIButton!
    @IBOutlet weak var reservationCompleteThumbnail: UIImageView!
    
    @IBOutlet weak var unlockMessageLabel: UILabel!
    
    override func viewWillAppear(animated: Bool) {
        self.navigationController?.setNavigationBarHidden(false, animated: false)
        navigationController?.navigationBar.backItem?.title = ""
        
        reservationCompleteThumbnail.image = CarBrowseViewController.thumbnailCache[(reservation!.carDetails!.thumbnailURL)!]  as? UIImage
        
        let color: UIColor = Colors.dark
        cancelReservationButton.layer.borderWidth = 2
        cancelReservationButton.layer.borderColor = color.CGColor
        cancelReservationButton.setTitleColor(color, forState: UIControlState.Normal)
        
        changeReservationButton.backgroundColor = color
        
        platNumberLabel.text = reservation?.carDetails?.license
        
        pickUpLabel.text = "Unknown location"
        
        if let _ = reservation {
            if let _ = reservation!.carDetails {
                if let _ = reservation!.carDetails!.name {
                    carNameLabel.text = reservation!.carDetails!.name!
                }
            } else {
                //TODO: localize
                carNameLabel.text = "unknown name"
            }
        }

        dispatch_async(dispatch_get_main_queue(), {
            self.cancelReservationButton.enabled = false
            self.unlockButton.enabled = false
            ReservationUtils.getReservation((self.reservation?._id)!, callback:{(reservation) in
                self.reservation = reservation
                dispatch_async(dispatch_get_main_queue(), {
                    self.setLabelsAccordingToStatus()
                })
            })
        })
        
        calculateDurationLabel()
        
        calculateBill()
        
        super.viewWillAppear(animated)
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()

    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        // Dispose of any resources that can be recreated.
    }
    
    @IBAction func locationButtonAction(sender: AnyObject) {
        if let car: CarData = reservation?.carDetails {
            if let latTemp = car.lat, longTemp = car.lng {
                let url : NSURL = NSURL(string: "http://maps.apple.com/maps?q=\(latTemp),\(longTemp))")!
                if UIApplication.sharedApplication().canOpenURL(url) {
                    UIApplication.sharedApplication().openURL(url)
                }
            }
        }
    }
    
    @IBAction func changeReservationAction(sender: AnyObject) {
    }

    @IBAction func cancelReservationAction(sender: AnyObject) {
        // Need at least 10 sec to anlyze trip
        if(reservation!.status == "driving" && reservation!.actualPickupTime != nil &&
            NSDate().timeIntervalSince1970 - Double((self.reservation!.actualPickupTime)!) < 15){ // under 15 secs
            confirmForTooShortTrip(cancelReservation)
        }else{
            cancelReservation()
        }
    }
    
    func cancelReservation() {
        cancelReservationButton.enabled = false
        
        let url = NSURL(string: "\(API.reservation)/\(self.reservation!._id!)")!
        let request = NSMutableURLRequest(URL: url)
        
        if let _ = reservation?.status {
            if reservation!.status == "active" {
                // if the reservation is active, then can cancel using DELETE
                request.HTTPMethod = "DELETE"
            } else {
                
                // if the reservation isn't active, then can complete using PUT
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.HTTPMethod = "PUT"
                
                var parm = ["status": "close"]
                let trip_id = ViewController.getTripId((self.reservation?.carDetails!.deviceID)!);
                if(trip_id != nil){
                    // bind this trip to this reservation
                    parm["trip_id"] = trip_id
                }
                if let data = try? NSJSONSerialization.dataWithJSONObject(parm, options:NSJSONWritingOptions(rawValue: 0)) as NSData? {
                    request.HTTPBody = data
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("\(data!.length)", forHTTPHeaderField: "Content-Length")
                }
            }
        }
 
        API.doRequest(request) { (httpResponse, jsonArray) -> Void in
            let statusCode = httpResponse.statusCode
            var title = ""
            var reservationType:String
            var leavePage = true
            switch statusCode {
            case 200:
                if let _ = self.reservation?.status {
                    if self.reservation!.status == "active" {
                        title = "Reservation canceled"
                        reservationType = "pickup"
                    } else {
                        title = "Reservation complete"
                        reservationType = "dropoff"
                    }
                    
                    ReservationsViewController.userReserved = true
                    CarBrowseViewController.userReserved = true
                    NotificationUtils.cancelNotification([
                        "reservationId":(self.reservation?._id)!,
                        "type": reservationType,
                        USER_DEFAULTS_KEY_APP_ROUTE: API.connectedAppURL,
                        USER_DEFAULTS_KEY_PUSH_APP_GUID: API.connectedPushAppGUID,
                        USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET: API.connectedPushClientSecret,
                        USER_DEFAULTS_KEY_MCA_TENANT_ID: API.connectedMcaTenantId
                    ])
                 }
                ViewController.completeDrive((self.reservation?.carDetails!.deviceID)!);
                break
            default:
                title = "Something went wrong."
                leavePage = false
            }
            let alert = UIAlertController(title: title, message: "", preferredStyle: .Alert)
            
            let okAction = UIAlertAction(title: "OK", style: .Cancel) { action -> Void in
                alert.removeFromParentViewController()
                if leavePage {
                    self.navigationController?.popViewControllerAnimated(true)
                }
            }
            alert.addAction(okAction)
            
            dispatch_async(dispatch_get_main_queue(), {
                self.presentViewController(alert, animated: true, completion: nil)
            })
        }
    }
    
    func confirmForTooShortTrip(callback:()->Void) {
        let title = "Confirmation"
        let message = "The driving time is too short to analyze your driving behaviors.\nDo you want to stop driving now?"
        
        let dialog = UIAlertController(title: title, message: message, preferredStyle: .Alert)
        let okAction = UIAlertAction(title: "Yes", style: .Default) { action in
            callback()
        }
        let cancelAction = UIAlertAction(title: "No", style: .Cancel) { action in
            // do nothing
        }
        dialog.addAction(okAction)
        dialog.addAction(cancelAction)
        
        dispatch_async(dispatch_get_main_queue(), {
            self.presentViewController(dialog, animated: true, completion: nil)
        })
    }
    
    @IBAction func unlockCarAction(sender: AnyObject) {
        let url = NSURL(string: API.carControl)!
        let request = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "POST"
        
        let reservationId = reservation?._id!
        var command = "lock"
        if reservation?.carDetails!.status == "Locked" {
            command = "unlock"
        }
        let parm = ["reservationId": "\(reservationId!)", "command" : "\(command)"]
        if let data = try? NSJSONSerialization.dataWithJSONObject(parm, options:NSJSONWritingOptions(rawValue: 0)) as NSData? {
            request.HTTPBody = data
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("\(data!.length)", forHTTPHeaderField: "Content-Length")
            
        }
        
        API.doRequest(request) { (httpResponse, jsonArray) -> Void in
            let reservations = ReservationsData.fromDictionary(jsonArray)
            if reservations.count == 1 {
                self.reservation = reservations[0]
            }
            
            let statusCode = httpResponse.statusCode
            switch statusCode {
            case 200:
                dispatch_async(dispatch_get_main_queue(), {
                    if command == "lock" {
                        self.unlockButton.setTitle("Unlock the car", forState: UIControlState.Normal)
                        self.unlockMessageLabel.text = ""
                    } else {
                        self.unlockButton.setTitle("Lock the car", forState: UIControlState.Normal)
                        self.unlockMessageLabel.text = "Enjoy your ride and drive safe"
                        self.unlockMessageLabel.textColor = Colors.accent
                        self.setLabelsAccordingToStatus()
                        NotificationUtils.cancelNotification([
                            "reservationId":reservationId!,
                            "type":"pickup",
                            USER_DEFAULTS_KEY_APP_ROUTE: API.connectedAppURL,
                            USER_DEFAULTS_KEY_PUSH_APP_GUID: API.connectedPushAppGUID,
                            USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET: API.connectedPushClientSecret,
                            USER_DEFAULTS_KEY_MCA_TENANT_ID: API.connectedMcaTenantId
                        ])
                        ReservationUtils.setDropoffNotification(self.reservation!)
                    }
                })
            default:
                NSLog("unknown status code on unlock car action")
            }
        }
    }
    
    func setLabelsAccordingToStatus() {
        let dateFormatter = NSDateFormatter()
        dateFormatter.dateStyle = NSDateFormatterStyle.ShortStyle
        dateFormatter.timeStyle = NSDateFormatterStyle.ShortStyle
        
        // If reservation status is active, then the car hasn't been unlocked and the reservation can be canceled.
        // Once the car is unlocked, the reservation status changes to driving.
        // If the reservation status is driving, then the reservation can only be completed.
        // If the car's status is locked, then it can be unlocked and vice versa.
        
        if let car: CarData = reservation?.carDetails {
            if let latTemp = car.lat, longTemp = car.lng {
                getLocation(latTemp, lng: longTemp)
            }
            // set labels depending on status
            if let reservationStatus = reservation?.status {
                if reservationStatus == "active" {
                    pickUpLabel.text = "Pick up:"
                    let pickupDate = NSDate(timeIntervalSince1970: (reservation?.pickupTime)!)
                    self.title = "Pick up at \(dateFormatter.stringFromDate(pickupDate))"
                    self.cancelReservationButton.setTitle("Cancel Reservation", forState: UIControlState.Normal)
                } else {
                    pickUpLabel.text = "Drop off:"
                    let dropoffDate = NSDate(timeIntervalSince1970: (reservation?.dropOffTime)!)
                    self.title = "Drop off at \(dateFormatter.stringFromDate(dropoffDate))"
                    self.cancelReservationButton.setTitle("Complete Reservation", forState: UIControlState.Normal)
                    self.unlockMessageLabel.text = ""
                }
                self.cancelReservationButton.enabled = true

                let carStatus = car.status
                if carStatus == "Locked" {
                    self.unlockButton.setTitle("Unlock the car", forState: UIControlState.Normal)
                } else {
                    self.unlockButton.setTitle("Lock the car", forState: UIControlState.Normal)
                }
                self.unlockButton.enabled = true
            }
        }
    }
    
    func calculateBill() {
        var diffInSecs = (reservation?.pickupTime)! - (reservation?.dropOffTime)!
        let days = floor(diffInSecs/86400)
        diffInSecs -= days * 86400;
        let hours = floor(diffInSecs/3600) % 24
        //diffInSecs -= hours * 3600
        //let mins = floor(diffInSecs/60) % 60
        
        var cost = 0
        if days > 0 {
            cost += Int(days) * reservation!.carDetails!.dailyRate!
        }
        if hours > 0 {
            cost += Int(hours) * reservation!.carDetails!.hourlyRate!
        }
        totalBillLabel.text = "$\(cost)"
    }
    
    func calculateDurationLabel() {
        let pickupDate = NSDate(timeIntervalSince1970: (reservation?.pickupTime)!)
        let dropoffDate = NSDate(timeIntervalSince1970: (reservation?.dropOffTime)!)
        
        
        let dateFormatter = NSDateFormatter()
        dateFormatter.dateStyle = NSDateFormatterStyle.ShortStyle
        dateFormatter.timeStyle = NSDateFormatterStyle.NoStyle
        let pickupDateString = dateFormatter.stringFromDate(pickupDate)
        let dropoffDateString = dateFormatter.stringFromDate(dropoffDate)
        dateFormatter.dateStyle = NSDateFormatterStyle.NoStyle
        dateFormatter.timeStyle = NSDateFormatterStyle.ShortStyle
        let pickupTimeString = dateFormatter.stringFromDate(pickupDate)
        let dropoffTimeString = dateFormatter.stringFromDate(dropoffDate)
        
        var durationText = "\(pickupDateString) \(pickupTimeString)"
        if pickupDateString == dropoffDateString {
            durationText += " - \(dropoffTimeString)"
        } else {
            durationText += " to \(dropoffDateString) \(dropoffTimeString)"
        }
        
        
        
        reservationDurationLabel.text = durationText
    }
    
    func getLocation(lat: Double, lng: Double) -> Void {
        let gc: CLGeocoder = CLGeocoder()
        let location = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        gc.reverseGeocodeLocation(CLLocation(latitude: location.latitude, longitude: location.longitude), completionHandler: {
            (placemarks: [CLPlacemark]?, error: NSError?) -> Void in
            dispatch_async(dispatch_get_main_queue(), {
                if (placemarks!.count > 0) {
                    let placemark = placemarks![0]
                    if placemark.name != nil && placemark.locality != nil {
                        let attrs = [
                            NSFontAttributeName : UIFont.systemFontOfSize(12.0),
                            NSForegroundColorAttributeName : UIColor.blackColor(),
                            NSUnderlineStyleAttributeName : 1,
                        ]
                        let text = "\(placemark.name!), \(placemark.locality!)"
                        //let textRange = NSMakeRange(0, text.characters.count)
                        let attributedText = NSAttributedString(string: text, attributes: attrs)
                        //attributedText.addAttribute(NSUnderlineStyleAttributeName , value:NSUnderlineStyle.StyleSingle.rawValue, range: textRange)
                        self.locationButton.setAttributedTitle(attributedText, forState: .Normal)
                    } else {
                        // TODO: localize
                        self.locationButton.setAttributedTitle(NSAttributedString(string: "unknown location"), forState: .Normal)
                        
                    }
                }
            })
        })
    }

    /*
    // MARK: - Navigation

    // In a storyboard-based application, you will often want to do a little preparation before navigation
    override func prepareForSegue(segue: UIStoryboardSegue, sender: AnyObject?) {
        // Get the new view controller using segue.destinationViewController.
        // Pass the selected object to the new view controller.
    }
    */

}
