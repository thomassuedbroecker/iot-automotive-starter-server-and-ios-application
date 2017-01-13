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
    var pickupDate: Date?
    var dropoffDate: Date?

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
    
    @IBAction func locationButtonAction(_ sender: AnyObject) {
        let url : URL = URL(string: "http://maps.apple.com/maps?q=\((car?.lat)!),\((car?.lng)!)")!
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.openURL(url)
        }
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // TODO: localize
        self.title = "Confirm Reservation"
        self.view.backgroundColor = UIColor.white
        
        self.carReserveThumbnail.image = CarBrowseViewController.thumbnailCache[(car?.thumbnailURL)!]  as? UIImage
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = DateFormatter.Style.medium
        dateFormatter.timeStyle = DateFormatter.Style.short
        pickupDate = Date(timeIntervalSinceNow: ReservationUtils.DEFAULT_PICKUP_TIME_OFFSET)
        pickupDate = Date(timeIntervalSince1970: CreateReservationViewController.round10Min(pickupDate!.timeIntervalSince1970))
        dropoffDate = Date(timeIntervalSinceNow: ReservationUtils.DEFAULT_DROPOFF_TIME_OFFSET)
        dropoffDate = Date(timeIntervalSince1970: CreateReservationViewController.round10Min(dropoffDate!.timeIntervalSince1970))
        pickupTextField.text = dateFormatter.string(from: pickupDate!)
        dropoffTextField.text = dateFormatter.string(from: dropoffDate!)

        // Do any additional setup after loading the view.
        setupDatePicker(pickupTextField, offsetTime: (pickupDate?.timeIntervalSinceNow)!)
        setupDatePicker(dropoffTextField, offsetTime: (dropoffDate?.timeIntervalSinceNow)!)
        
        carNameLabel.text = car?.name
        
        getLocation((car?.lat)!, lng: (car?.lng)!)
        ratingLabel.text = String(repeating: "\u{2605}", count: (car?.stars)!) + String(repeating: "\u{2606}", count: (5-(car?.stars)!))
        
        ratingLabel.textColor = UIColor(red: 243/255, green: 118/255, blue: 54/255, alpha: 100)
        
        let pickupImageView = UIImageView()
        pickupImageView.image = UIImage(named: "calendar")
        pickupImageView.frame = CGRect(x: 7, y: (pickupTextField.frame.size.height-15)/2, width: 15, height: 15)
        
        let dropoffImageView = UIImageView()
        dropoffImageView.image = UIImage(named: "calendar")
        dropoffImageView.frame = CGRect(x: 7, y: (dropoffTextField.frame.size.height-15)/2, width: 15, height: 15)
        
        pickupTextField.addSubview(pickupImageView)
        dropoffTextField.addSubview(dropoffImageView)

        pickupTextField.leftView = UIView.init(frame: CGRect(x: 5, y: 0, width: 20, height: 20))
        dropoffTextField.leftView = UIView.init(frame: CGRect(x: 5, y: 0, width: 20, height: 20))
        
        pickupTextField.leftViewMode = UITextFieldViewMode.always
        dropoffTextField.leftViewMode = UITextFieldViewMode.always
        
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
        let hours = floor(diffInSecs/3600).truncatingRemainder(dividingBy: 24)
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
    
    @IBAction func reserveCarAction(_ sender: AnyObject) {
        let url = URL(string: API.reservation)!
        let request = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "POST"
        
        let carId = car?.deviceID!
        let pickupTime = (pickupDate?.timeIntervalSince1970)!
        let dropoffTime = (dropoffDate?.timeIntervalSince1970)!
        var params = "carId=\(carId!)&pickupTime=\(pickupTime)&dropOffTime=\(dropoffTime)"
        if let deviceId = NotificationUtils.getDeviceId() {
            params += "&deviceId=\(deviceId)"
        }
        request.HTTPBody = params.dataUsingEncoding(String.Encoding.utf8)
        
        API.doRequest(request, callback: reserveCarActionCallback)
    }
    static func round10Min(_ time:TimeInterval)->TimeInterval{
        let date = Date(timeIntervalSince1970: time)
        let cal = Calendar(identifier: Calendar.Identifier.gregorian)
        var components = (cal as NSCalendar?)?.components([.year, .month, .day, .hour, .minute], from:date)
        components?.minute = ((components?.minute)!/10)*10
        components?.second = 0
        return (cal.date(from: components!)?.timeIntervalSince1970)!
    }

    func reserveCarActionCallback(_ httpResponse: HTTPURLResponse, jsonArray: [NSDictionary]) {
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
        let alert = UIAlertController(title: title, message: "", preferredStyle: .alert)
        
        let okAction = UIAlertAction(title: "OK", style: .cancel) { action -> Void in
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
        
        DispatchQueue.main.async(execute: {
            self.present(alert, animated: true, completion: nil)
        })
    }
    
    func setupDatePicker(_ textField:UITextField, offsetTime: TimeInterval) {
        let datePicker: UIDatePicker = UIDatePicker()
        datePicker.backgroundColor = UIColor.white
        datePicker.datePickerMode = UIDatePickerMode.dateAndTime
        datePicker.minuteInterval = 10
        datePicker.addTarget(self, action: #selector(self.datePickerValueChanged),
            for: UIControlEvents.valueChanged)
        datePicker.date = Date(timeIntervalSince1970: CreateReservationViewController.round10Min(Date().timeIntervalSince1970 + offsetTime))
        textField.inputView = datePicker
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = DateFormatter.Style.medium
        dateFormatter.timeStyle = DateFormatter.Style.short
        textField.text = dateFormatter.string(from: datePicker.date)
        
        let pickerToolbar = UIToolbar()
        pickerToolbar.barStyle = UIBarStyle.blackTranslucent
        pickerToolbar.tintColor = UIColor.white
        pickerToolbar.sizeToFit()
        
        let spaceButtonPicker = UIBarButtonItem(barButtonSystemItem: UIBarButtonSystemItem.flexibleSpace, target: nil, action: nil)
        let cancelButtonPicker = UIBarButtonItem(title: "Done", style: UIBarButtonItemStyle.plain, target: self, action: #selector(self.cancelDatePicker))
        pickerToolbar.setItems([cancelButtonPicker, spaceButtonPicker], animated: false)
        pickerToolbar.isUserInteractionEnabled = true
        textField.inputAccessoryView = pickerToolbar
    }
    
    func datePickerValueChanged(_ sender: UIDatePicker) {
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = DateFormatter.Style.medium
        dateFormatter.timeStyle = DateFormatter.Style.short
        if (pickupTextField.isFirstResponder) {
            pickupTextField.text = dateFormatter.string(from: sender.date)
            pickupDate = sender.date
        } else {
            dropoffTextField.text = dateFormatter.string(from: sender.date)
            dropoffDate = sender.date
        }
        calculateTime()
    }
    
    func cancelDatePicker(_ sender: UIBarButtonItem) {
        dropoffTextField.resignFirstResponder()
        pickupTextField.resignFirstResponder()
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
