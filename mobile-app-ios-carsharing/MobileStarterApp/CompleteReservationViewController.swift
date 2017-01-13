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
    
    override func viewWillAppear(_ animated: Bool) {
        self.navigationController?.setNavigationBarHidden(false, animated: false)
        navigationController?.navigationBar.backItem?.title = ""
        
        reservationCompleteThumbnail.image = CarBrowseViewController.thumbnailCache[(reservation!.carDetails!.thumbnailURL)!]  as? UIImage
        
        let color: UIColor = Colors.dark
        cancelReservationButton.layer.borderWidth = 2
        cancelReservationButton.layer.borderColor = color.cgColor
        cancelReservationButton.setTitleColor(color, for: UIControlState())
        
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

        DispatchQueue.main.async(execute: {
            self.cancelReservationButton.isEnabled = false
            self.unlockButton.isEnabled = false
            ReservationUtils.getReservation((self.reservation?._id)!, callback:{(reservation) in
                self.reservation = reservation
                DispatchQueue.main.async(execute: {
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
    
    @IBAction func locationButtonAction(_ sender: AnyObject) {
        if let car: CarData = reservation?.carDetails {
            if let latTemp = car.lat, let longTemp = car.lng {
                let url : URL = URL(string: "http://maps.apple.com/maps?q=\(latTemp),\(longTemp))")!
                if UIApplication.shared.canOpenURL(url) {
                    UIApplication.shared.openURL(url)
                }
            }
        }
    }
    
    @IBAction func changeReservationAction(_ sender: AnyObject) {
    }

    @IBAction func cancelReservationAction(_ sender: AnyObject) {
        // Need at least 10 sec to anlyze trip
        if(reservation!.status == "driving" && reservation!.actualPickupTime != nil &&
            Date().timeIntervalSince1970 - Double((self.reservation!.actualPickupTime)!) < 15){ // under 15 secs
            confirmForTooShortTrip(cancelReservation)
        }else{
            cancelReservation()
        }
    }
    
    func cancelReservation() {
        cancelReservationButton.isEnabled = false
        
        let url = URL(string: "\(API.reservation)/\(self.reservation!._id!)")!
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
                if let data = try? JSONSerialization.data(withJSONObject: parm, options:JSONSerialization.WritingOptions(rawValue: 0)) as Data? {
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
    
    func confirmForTooShortTrip(_ callback:@escaping ()->Void) {
        let title = "Confirmation"
        let message = "The driving time is too short to analyze your driving behaviors.\nDo you want to stop driving now?"
        
        let dialog = UIAlertController(title: title, message: message, preferredStyle: .alert)
        let okAction = UIAlertAction(title: "Yes", style: .default) { action in
            callback()
        }
        let cancelAction = UIAlertAction(title: "No", style: .cancel) { action in
            // do nothing
        }
        dialog.addAction(okAction)
        dialog.addAction(cancelAction)
        
        DispatchQueue.main.async(execute: {
            self.present(dialog, animated: true, completion: nil)
        })
    }
    
    @IBAction func unlockCarAction(_ sender: AnyObject) {
        let url = URL(string: API.carControl)!
        let request = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "POST"
        
        let reservationId = reservation?._id!
        var command = "lock"
        if reservation?.carDetails!.status == "Locked" {
            command = "unlock"
        }
        let parm = ["reservationId": "\(reservationId!)", "command" : "\(command)"]
        if let data = try? JSONSerialization.data(withJSONObject: parm, options:JSONSerialization.WritingOptions(rawValue: 0)) as Data? {
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
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = DateFormatter.Style.short
        dateFormatter.timeStyle = DateFormatter.Style.short
        
        // If reservation status is active, then the car hasn't been unlocked and the reservation can be canceled.
        // Once the car is unlocked, the reservation status changes to driving.
        // If the reservation status is driving, then the reservation can only be completed.
        // If the car's status is locked, then it can be unlocked and vice versa.
        
        if let car: CarData = reservation?.carDetails {
            if let latTemp = car.lat, let longTemp = car.lng {
                getLocation(latTemp, lng: longTemp)
            }
            // set labels depending on status
            if let reservationStatus = reservation?.status {
                if reservationStatus == "active" {
                    pickUpLabel.text = "Pick up:"
                    let pickupDate = Date(timeIntervalSince1970: (reservation?.pickupTime)!)
                    self.title = "Pick up at \(dateFormatter.string(from: pickupDate))"
                    self.cancelReservationButton.setTitle("Cancel Reservation", for: UIControlState())
                } else {
                    pickUpLabel.text = "Drop off:"
                    let dropoffDate = Date(timeIntervalSince1970: (reservation?.dropOffTime)!)
                    self.title = "Drop off at \(dateFormatter.string(from: dropoffDate))"
                    self.cancelReservationButton.setTitle("Complete Reservation", for: UIControlState())
                    self.unlockMessageLabel.text = ""
                }
                self.cancelReservationButton.isEnabled = true

                let carStatus = car.status
                if carStatus == "Locked" {
                    self.unlockButton.setTitle("Unlock the car", for: UIControlState())
                } else {
                    self.unlockButton.setTitle("Lock the car", for: UIControlState())
                }
                self.unlockButton.isEnabled = true
            }
        }
    }
    
    func calculateBill() {
        var diffInSecs = (reservation?.pickupTime)! - (reservation?.dropOffTime)!
        let days = floor(diffInSecs/86400)
        diffInSecs -= days * 86400;
        let hours = floor(diffInSecs/3600).truncatingRemainder(dividingBy: 24)
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
        let pickupDate = Date(timeIntervalSince1970: (reservation?.pickupTime)!)
        let dropoffDate = Date(timeIntervalSince1970: (reservation?.dropOffTime)!)
        
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = DateFormatter.Style.short
        dateFormatter.timeStyle = DateFormatter.Style.none
        let pickupDateString = dateFormatter.string(from: pickupDate)
        let dropoffDateString = dateFormatter.string(from: dropoffDate)
        dateFormatter.dateStyle = DateFormatter.Style.none
        dateFormatter.timeStyle = DateFormatter.Style.short
        let pickupTimeString = dateFormatter.string(from: pickupDate)
        let dropoffTimeString = dateFormatter.string(from: dropoffDate)
        
        var durationText = "\(pickupDateString) \(pickupTimeString)"
        if pickupDateString == dropoffDateString {
            durationText += " - \(dropoffTimeString)"
        } else {
            durationText += " to \(dropoffDateString) \(dropoffTimeString)"
        }
        
        
        
        reservationDurationLabel.text = durationText
    }
    
    func getLocation(_ lat: Double, lng: Double) -> Void {
        let gc: CLGeocoder = CLGeocoder()
        let location = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        gc.reverseGeocodeLocation(CLLocation(latitude: location.latitude, longitude: location.longitude), completionHandler: {
            (placemarks: [CLPlacemark]?, error: NSError?) -> Void in
            DispatchQueue.main.async(execute: {
                if (placemarks!.count > 0) {
                    let placemark = placemarks![0]
                    if placemark.name != nil && placemark.locality != nil {
                        let attrs = [
                            NSFontAttributeName : UIFont.systemFont(ofSize: 12.0),
                            NSForegroundColorAttributeName : UIColor.black,
                            NSUnderlineStyleAttributeName : 1,
                        ] as [String : Any]
                        let text = "\(placemark.name!), \(placemark.locality!)"
                        //let textRange = NSMakeRange(0, text.characters.count)
                        let attributedText = NSAttributedString(string: text, attributes: attrs)
                        //attributedText.addAttribute(NSUnderlineStyleAttributeName , value:NSUnderlineStyle.StyleSingle.rawValue, range: textRange)
                        self.locationButton.setAttributedTitle(attributedText, for: UIControlState())
                    } else {
                        // TODO: localize
                        self.locationButton.setAttributedTitle(NSAttributedString(string: "unknown location"), for: UIControlState())
                        
                    }
                }
            })
        } as! CLGeocodeCompletionHandler)
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
