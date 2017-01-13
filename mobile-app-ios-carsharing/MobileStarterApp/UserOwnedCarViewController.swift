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
import MapKit
import CoreLocation

class UserOwnedCarViewController: UIViewController, CLLocationManagerDelegate {
    
    @IBOutlet weak var mapView: MKMapView!
    @IBOutlet weak var titleLabel: UILabel!
    @IBOutlet weak var drivingButton: UIButton!

    let locationManager = CLLocationManager()
    var tripCount: Int = 0
    
    var startedDriving: Bool = false
    var deviceID: String! = ViewController.mobileAppDeviceId
    
    var reservationId: String?
    var reservations: [ReservationsData]?
    
    var pickupTime: Double?
    var dropoffTime: Double?
    
    var alreadyReserved: Bool = false
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        switch CLLocationManager.authorizationStatus(){
        case .denied:
            fallthrough
        case .restricted:
            fallthrough
        case .notDetermined:
            let alert = UIAlertController(title: "Location Required", message: "Using your location, you can analyze your driving.", preferredStyle: .alert)
            let okAction = UIAlertAction(title: "Setting", style: .default) { action -> Void in
                let url = URL(string: UIApplicationOpenSettingsURLString)!
                UIApplication.shared.openURL(url)
            }
            let cancelAction = UIAlertAction(title: "Don't Allow", style: .cancel){action -> Void in
                // do nothing
            }
            alert.addAction(okAction)
            alert.addAction(cancelAction)
            present(alert, animated: true, completion: nil)
        default:
            break
        }
        
        self.locationManager.delegate = self
        self.tabBarController?.tabBar.isHidden = false
        
        self.locationManager.desiredAccuracy = kCLLocationAccuracyBest
        self.locationManager.activityType = .automotiveNavigation
        self.locationManager.requestWhenInUseAuthorization()
        self.locationManager.startUpdatingLocation()
        
        self.mapView.delegate = self
        self.mapView.showsUserLocation = true
        self.mapView.userTrackingMode = .follow
    }
    
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        
        self.titleLabel.text = "Press Start Driving when ready"
    }
    @IBAction func onHomeButtonTapped(_ sender: UIButton) {
        if self.reservationId != nil{
            let cancelAction = UIAlertAction(title: "No", style: .cancel, handler: {action -> Void in
                // do nothing
            })
            let okAction = UIAlertAction(title: "Yes", style: .destructive, handler: {action -> Void in
                self.completeReservation(self.reservationId!, alreadyTaken: false)
                self.tabBarController?.navigationController?.popViewController(animated: true)
            })
            self.openAlert("Warning", message: "Going back to the home page would complete your current drive. Are you sure?", actions: [cancelAction, okAction])
        }else{
            self.tabBarController?.navigationController?.popViewController(animated: true)
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateToLocation newLocation: CLLocation, fromLocation oldLocation: CLLocation) {
        if(!mapView.isUserLocationVisible){
            mapView.userTrackingMode = .follow   
        }
        if (self.startedDriving) {
            if(!ViewController.behaviorDemo){
                // get credentials may be failed
                startedDriving = false
                self.completeReservation(self.reservationId!, alreadyTaken: false)
                drivingButton.setBackgroundImage(UIImage(named: "startDriving"), for: UIControlState())
                return
            }
            let mphSpeed = round(newLocation.speed * 60 * 60 / 16.0934)/100
            self.titleLabel.text = "Speed: \(max(0, mphSpeed)) MPH"
            let center = CLLocationCoordinate2DMake(newLocation.coordinate.latitude, newLocation.coordinate.longitude)
            let circle = MKCircle(center: center, radius: 10);
            circle.title = "location"
            mapView.add(circle)
            
            self.tripCount += 1
            if(self.tripCount % 10 == 0) {
                renderMapMatchedLocation()
            }
        }
    }
    
    func renderMapMatchedLocation() {
        let trip_id = ViewController.getTripId(self.deviceID)
        if (trip_id == nil){
            return
        }
        let url: URL = URL(string: "\(API.tripRoutes)/" + (trip_id)! + "?count=20&matchedOnly=true")!
        let request: NSMutableURLRequest = NSMutableURLRequest(url: url)
        request.httpMethod = "GET"
        
        var stats:[Path] = []
        API.doRequest(request) { (response, jsonArray) -> Void in
            stats = Path.fromDictionary(jsonArray)
            if stats.count > 0 {
                if let stat: Path = stats[0] {
                    DispatchQueue.main.async(execute: {
                        for coordinate in stat.coordinates! {
                            let circle = MKCircle(center: CLLocationCoordinate2DMake(coordinate[1].doubleValue!, coordinate[0].doubleValue!), radius: 10);
                            circle.title = "mapMacthed"
                            self.mapView.add(circle)
                        }
                    })
                }
            }
        }
    }
    
    func reserveCar() {
        // reserve my device as a car
        let url = URL(string: API.reservation)!
        let request = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "POST"
        
        self.pickupTime = Date().timeIntervalSince1970
        self.dropoffTime = Date().timeIntervalSince1970 + 3600
        
        let params = "carId=\(self.deviceID!)&pickupTime=\(self.pickupTime!)&dropOffTime=\(self.dropoffTime!)"
        
        request.HTTPBody = params.dataUsingEncoding(String.Encoding.utf8)
        
        API.doRequest(request, callback: reserveCarCallback)
        
        alreadyReserved = true
    }
    
    @IBAction func startedDriving(_ sender: AnyObject) {
        if (!startedDriving) {
            self.mapView.removeOverlays(self.mapView.overlays)
            if(ViewController.startDrive(self.deviceID!)){
                self.reserveCar()
                drivingButton.setBackgroundImage(UIImage(named: "endDriving"), for: UIControlState())
            }else{
                self.openAlert("Failed to connect to IoT Platform", message:"", actions:nil)
            }
        } else {
            let comp = {()->Void in
                self.startedDriving = false
                self.completeReservation(self.reservationId!, alreadyTaken: false)
                self.drivingButton.setBackgroundImage(UIImage(named: "startDriving"), for: UIControlState())
            }
            if(Date().timeIntervalSince1970 - self.pickupTime! < 15){
                // at least 10 secs is necessary to analyze driving behavior.
                self.confirmForTooShortTrip(comp);
            }else{
                comp();
            }
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
    
    func useExistingReservation() {
        let url = URL(string: API.reservations)!
        let request = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "GET"
        
        API.doRequest(request) { (response, jsonArray) -> Void in
            DispatchQueue.main.async(execute: {
                self.reservations = ReservationsData.fromDictionary(jsonArray)
                
                for reservation in self.reservations! {
                    if (reservation.carId == ViewController.mobileAppDeviceId) {
                        if(reservation.status == "driving"){
                            // my device is already driving. 
                            // Maybe we should complete it once and restart driving.
                            self.completeReservation(reservation._id!, alreadyTaken: true)
                            dispatch_async(dispatch_get_main_queue(), {
                                self.reserveCar()
                            })
                        } else {
                            // reuse existing active reservation
                            self.startedDriving = true
                            self.reservationId = reservation._id!
                        }
                    }
                }
            })
        }
    }
    
    func completeReservation(_ reservationId: String, alreadyTaken: Bool) {
        
        let url = URL(string: "\(API.reservation)/\(reservationId)")!
        let request = NSMutableURLRequest(URL: url)
        
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.HTTPMethod = "PUT"
        
        var parm = ["status": "close"]
        
        let trip_id = ViewController.getTripId(self.deviceID);
        if(trip_id != nil){
            // bind this trip to this reservation
            parm["trip_id"] = trip_id
        }
        ViewController.completeDrive(self.deviceID);
        
        if let data = try? JSONSerialization.data(withJSONObject: parm, options:JSONSerialization.WritingOptions(rawValue: 0)) as Data? {
            request.HTTPBody = data
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("\(data!.length)", forHTTPHeaderField: "Content-Length")
        }
        
        API.doRequest(request) { (httpResponse, jsonArray) -> Void in
            let statusCode = httpResponse.statusCode
            
            var title = ""
            var message = ""
            
            switch statusCode {
            case 200:
                title = "Drive completed"
                message = "Please allow at least 10 minutes for the driver behavior data to be analyzed"
                self.reservationId = nil
                break
            default:
                title = "Something went wrong."
            }
            
            dispatch_async(dispatch_get_main_queue(), {
                self.titleLabel.text = title
            })
            
            if (!alreadyTaken) {
                self.openAlert(title, message: message, actions: nil)
            }
        }
    }
    
    func openAlert(_ title: String, message: String, actions: [UIAlertAction]?){
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        if let _actions:[UIAlertAction] = actions {
            for action in _actions {
                alert.addAction(action)
            }
        }else{
            let okAction = UIAlertAction(title: "OK", style: .cancel) { action -> Void in
                alert.removeFromParentViewController()
            }
            alert.addAction(okAction)
        }
        
        DispatchQueue.main.async(execute: {
            UIApplication.shared.keyWindow?.rootViewController!.present(alert, animated: true, completion: nil)
        })
    }
    
    func cancelReservation(_ reservationId: String) {
        let url = URL(string: "\(API.reservation)/\(reservationId)")!
        let request = NSMutableURLRequest(URL: url)
        
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.HTTPMethod = "DELETE"
        
        API.doRequest(request) { (httpResponse, jsonArray) -> Void in
        }
    }
    
    func reserveCarCallback(_ httpResponse: HTTPURLResponse, jsonArray: [NSDictionary]) {
        let statusCode = httpResponse.statusCode
        
        switch statusCode {
        case 200:
            // start driving
            self.startedDriving = true
            self.reservationId = ((jsonArray[0]["reservationId"])!) as? String
            break
        case 409:
            self.titleLabel.text = "Car already taken"
            useExistingReservation()
            break
        case 404:
            self.titleLabel.text = "Car is not available"
            break
        default:
            self.titleLabel.text = "Something Went Wrong."
        }
    }
}

extension UserOwnedCarViewController: MKMapViewDelegate {
    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        let renderer:MKOverlayPathRenderer
        if overlay is MKCircle {
            renderer = MKCircleRenderer(overlay:overlay)
        } else {
            renderer = MKPolylineRenderer(overlay:overlay)
        }
        if (overlay.title! == "location") {
            renderer.fillColor = UIColor(red: 0.7, green: 0.0, blue: 0.0, alpha: 0.5)
        } else {
            renderer.fillColor = UIColor(red: 0.0, green: 0.7, blue: 0.0, alpha: 1.0)
        }
        return renderer
    }
}
