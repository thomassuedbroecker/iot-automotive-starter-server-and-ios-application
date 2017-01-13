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

class CreateReservationViewController: UIViewController {
    
    var car: CarData?
    var pickupDate: NSDate?
    var dropoffDate: NSDate?

    @IBOutlet weak var dropoffTextField: UITextField!
    @IBOutlet weak var pickupTextField: UITextField!
    
    @IBOutlet weak var carNameLabel: UILabel!
    @IBOutlet weak var ratingLabel: UILabel!
    @IBOutlet weak var locationButton: UIButton!
    @IBOutlet weak var totalTimeLabel: UILabel!
    @IBOutlet weak var totalBillLabel: UILabel!
    @IBOutlet weak var typeLabel: UILabel!
    @IBOutlet weak var driveLabel: UILabel!
    @IBOutlet weak var adviceLabel: UILabel!
    
    @IBOutlet weak var carReserveThumbnail: UIImageView!
    
    @IBAction func locationButtonAction(sender: AnyObject) {
        let url : NSURL = NSURL(string: "http://maps.apple.com/maps?q=\((car?.lat)!),\((car?.lng)!)")!
        if UIApplication.sharedApplication().canOpenURL(url) {
            UIApplication.sharedApplication().openURL(url)
        }
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // TODO: localize
        self.title = "Confirm Reservation"
        self.view.backgroundColor = UIColor.whiteColor()
        
        self.carReserveThumbnail.image = CarBrowseViewController.thumbnailCache[(car?.thumbnailURL)!]  as? UIImage
        
        let dateFormatter = NSDateFormatter()
        dateFormatter.dateStyle = NSDateFormatterStyle.MediumStyle
        dateFormatter.timeStyle = NSDateFormatterStyle.ShortStyle
        pickupDate = NSDate(timeIntervalSinceNow: ReservationUtils.DEFAULT_PICKUP_TIME_OFFSET)
        pickupDate = NSDate(timeIntervalSince1970: CreateReservationViewController.round10Min(pickupDate!.timeIntervalSince1970))
        dropoffDate = NSDate(timeIntervalSinceNow: ReservationUtils.DEFAULT_DROPOFF_TIME_OFFSET)
        dropoffDate = NSDate(timeIntervalSince1970: CreateReservationViewController.round10Min(dropoffDate!.timeIntervalSince1970))
        pickupTextField.text = dateFormatter.stringFromDate(pickupDate!)
        dropoffTextField.text = dateFormatter.stringFromDate(dropoffDate!)

        // Do any additional setup after loading the view.
        setupDatePicker(pickupTextField, offsetTime: (pickupDate?.timeIntervalSinceNow)!)
        setupDatePicker(dropoffTextField, offsetTime: (dropoffDate?.timeIntervalSinceNow)!)
        
        carNameLabel.text = car?.name
        
        getLocation((car?.lat)!, lng: (car?.lng)!)
        ratingLabel.text = String(count: (car?.stars)!, repeatedValue: Character("\u{2605}")) + String(count: (5-(car?.stars)!), repeatedValue: Character("\u{2606}"))
        
        ratingLabel.textColor = UIColor(red: 243/255, green: 118/255, blue: 54/255, alpha: 100)
        
        let pickupImageView = UIImageView()
        pickupImageView.image = UIImage(named: "calendar")
        pickupImageView.frame = CGRect(x: 7, y: (pickupTextField.frame.size.height-15)/2, width: 15, height: 15)
        
        let dropoffImageView = UIImageView()
        dropoffImageView.image = UIImage(named: "calendar")
        dropoffImageView.frame = CGRect(x: 7, y: (dropoffTextField.frame.size.height-15)/2, width: 15, height: 15)
        
        pickupTextField.addSubview(pickupImageView)
        dropoffTextField.addSubview(dropoffImageView)

        pickupTextField.leftView = UIView.init(frame: CGRectMake(5, 0, 20, 20))
        dropoffTextField.leftView = UIView.init(frame: CGRectMake(5, 0, 20, 20))
        
        pickupTextField.leftViewMode = UITextFieldViewMode.Always
        dropoffTextField.leftViewMode = UITextFieldViewMode.Always
        
        typeLabel.text = car?.type
        driveLabel.text = car?.drive
        
        if (car?.rateCauseLong == nil) {
            adviceLabel.text = "none"
        } else {
            adviceLabel.text = car?.rateCauseLong
        }
        
        calculateTime()
    }
    
    func calculateTime() {
        var diffInSecs = (dropoffDate?.timeIntervalSince1970)! - (pickupDate?.timeIntervalSince1970)!
        let days = floor(diffInSecs/86400)
        diffInSecs -= days * 86400;
        let hours = floor(diffInSecs/3600) % 24
        //diffInSecs -= hours * 3600
        //let mins = floor(diffInSecs/60) % 60
        
        var durationString = ""
        var cost = 0
        if days > 0 {
            durationString = (days == 1 ? "1 day, " : "\(Int(days)) days, ")
            cost += Int(days) * 40
        }
        if hours > 0 {
            durationString += (hours == 1 ? "1 hour " : "\(Int(hours)) hours ")
            cost += Int(hours) * 15
        }
        if days == 0 && hours == 0 {
            durationString = "1 hour"
        }
        totalTimeLabel.text = durationString
        totalBillLabel.text = "$\(cost)"
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        // Dispose of any resources that can be recreated.
    }
    
    @IBAction func reserveCarAction(sender: AnyObject) {
        let url = NSURL(string: API.reservation)!
        let request = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "POST"
        
        let carId = car?.deviceID!
        let pickupTime = (pickupDate?.timeIntervalSince1970)!
        let dropoffTime = (dropoffDate?.timeIntervalSince1970)!
        var params = "carId=\(carId!)&pickupTime=\(pickupTime)&dropOffTime=\(dropoffTime)"
        if let deviceId = NotificationUtils.getDeviceId() {
            params += "&deviceId=\(deviceId)"
        }
        request.HTTPBody = params.dataUsingEncoding(NSUTF8StringEncoding)
        
        API.doRequest(request, callback: reserveCarActionCallback)
    }
    static func round10Min(time:NSTimeInterval)->NSTimeInterval{
        let date = NSDate(timeIntervalSince1970: time)
        let cal = NSCalendar(identifier: NSCalendarIdentifierGregorian)
        let components = cal?.components([.Year, .Month, .Day, .Hour, .Minute], fromDate:date)
        components?.minute = ((components?.minute)!/10)*10
        components?.second = 0
        return (cal?.dateFromComponents(components!)?.timeIntervalSince1970)!
    }

    func reserveCarActionCallback(httpResponse: NSHTTPURLResponse, jsonArray: [NSDictionary]) {
        let statusCode = httpResponse.statusCode
        var title = ""
        var leavePage = true
        switch statusCode {
        case 200:
            title = "Reservation successful"
            CarBrowseViewController.userReserved = true
            ReservationsViewController.userReserved = true
            if jsonArray.count > 0, let reservationId = jsonArray[0]["reservationId"] as? String {
                ReservationUtils.getReservation(reservationId, callback: ReservationUtils.setPickupNotification)
            }
            break
        case 409:
            title = "Car already taken"
            break
        case 404:
            title = "Car is not available"
            break
        default:
            title = "Something went wrong."
            leavePage = false
        }
        let alert = UIAlertController(title: title, message: "", preferredStyle: .Alert)
        
        let okAction = UIAlertAction(title: "OK", style: .Cancel) { action -> Void in
            alert.removeFromParentViewController()
            if leavePage {
                // pop to home tab
                for vc in (self.navigationController?.viewControllers)! {
                    if vc is UITabBarController {
                        self.navigationController?.popToViewController(vc, animated: true)
                    }
                }
            }
        }
        alert.addAction(okAction)
        
        dispatch_async(dispatch_get_main_queue(), {
            self.presentViewController(alert, animated: true, completion: nil)
        })
    }
    
    func setupDatePicker(textField:UITextField, offsetTime: NSTimeInterval) {
        let datePicker: UIDatePicker = UIDatePicker()
        datePicker.backgroundColor = UIColor.whiteColor()
        datePicker.datePickerMode = UIDatePickerMode.DateAndTime
        datePicker.minuteInterval = 10
        datePicker.addTarget(self, action: #selector(self.datePickerValueChanged),
            forControlEvents: UIControlEvents.ValueChanged)
        datePicker.date = NSDate(timeIntervalSince1970: CreateReservationViewController.round10Min(NSDate().timeIntervalSince1970 + offsetTime))
        textField.inputView = datePicker
        let dateFormatter = NSDateFormatter()
        dateFormatter.dateStyle = NSDateFormatterStyle.MediumStyle
        dateFormatter.timeStyle = NSDateFormatterStyle.ShortStyle
        textField.text = dateFormatter.stringFromDate(datePicker.date)
        
        let pickerToolbar = UIToolbar()
        pickerToolbar.barStyle = UIBarStyle.BlackTranslucent
        pickerToolbar.tintColor = UIColor.whiteColor()
        pickerToolbar.sizeToFit()
        
        let spaceButtonPicker = UIBarButtonItem(barButtonSystemItem: UIBarButtonSystemItem.FlexibleSpace, target: nil, action: nil)
        let cancelButtonPicker = UIBarButtonItem(title: "Done", style: UIBarButtonItemStyle.Plain, target: self, action: #selector(self.cancelDatePicker))
        pickerToolbar.setItems([cancelButtonPicker, spaceButtonPicker], animated: false)
        pickerToolbar.userInteractionEnabled = true
        textField.inputAccessoryView = pickerToolbar
    }
    
    func datePickerValueChanged(sender: UIDatePicker) {
        let dateFormatter = NSDateFormatter()
        dateFormatter.dateStyle = NSDateFormatterStyle.MediumStyle
        dateFormatter.timeStyle = NSDateFormatterStyle.ShortStyle
        if (pickupTextField.isFirstResponder()) {
            pickupTextField.text = dateFormatter.stringFromDate(sender.date)
            pickupDate = sender.date
        } else {
            dropoffTextField.text = dateFormatter.stringFromDate(sender.date)
            dropoffDate = sender.date
        }
        calculateTime()
    }
    
    func cancelDatePicker(sender: UIBarButtonItem) {
        dropoffTextField.resignFirstResponder()
        pickupTextField.resignFirstResponder()
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
