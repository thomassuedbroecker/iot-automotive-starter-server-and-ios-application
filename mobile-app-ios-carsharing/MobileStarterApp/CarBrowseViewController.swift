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

class CarBrowseViewController: UIViewController {

    @IBOutlet weak var tableView: UITableView!
    @IBOutlet weak var mapView: MKMapView!
    @IBOutlet weak var titleLabel: UILabel!
    @IBOutlet weak var headerView: UIView!
    
    @IBOutlet weak var locationIcon: UIButton!
    
    let locationManager = CLLocationManager()
    var location: CLLocationCoordinate2D?
    var carData: [CarData] = []
    var mapRect: MKMapRect?
    
    static let MIN_MAP_RECT_WIDTH:Double = 5000
    static let MIN_MAP_RECT_HEIGHT:Double = 5000

    static var thumbnailCache = NSMutableDictionary()
    static var jsonIndexCache = NSMutableDictionary()
    
    static var pickupDate: Int?
    static var dropoffDate: Int?
    static var filtersApplied: Bool = false
    static var userOwnDeviceCreated: Bool = false
    
    let pickerData = [
        "Current Location",
        "Tokyo, Japan",
        "MGM Grand, Las Vegas",
        "Mandalay Bay, Las Vegas",
        "Hellabrunn Zoo, Munich, Germany",
        "Nymphenburg Palace, Munich, Germany"
    ]
    var locationData = [
        CLLocationCoordinate2D(latitude: 0, longitude: 0),
        CLLocationCoordinate2D(latitude: 35.709026, longitude: 139.731992),
        CLLocationCoordinate2D(latitude: 36.10073, longitude: -115.168407),
        CLLocationCoordinate2D(latitude: 36.093247, longitude: -115.176085),
        CLLocationCoordinate2D(latitude: 48.0993, longitude: 11.55848),
        CLLocationCoordinate2D(latitude: 48.176656, longitude: 11.553583)
    ]
    
    var locationPicker = UIPickerView()
    var pickerView = UIView()
    
    static var userReserved: Bool = true
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        self.locationManager.delegate = self
        self.mapView.delegate = self
        self.tabBarController?.tabBar.hidden = false
        
        self.locationManager.desiredAccuracy = kCLLocationAccuracyBest
        self.locationManager.requestWhenInUseAuthorization()
        self.locationManager.startUpdatingLocation()
        self.mapView.showsUserLocation = true
        
        tableView.backgroundColor = UIColor.whiteColor()

        
        headerView.backgroundColor = Colors.dark
        
        setupPicker()
    }
    
    override func viewWillAppear(animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: false)

        if (self.location != nil && CarBrowseViewController.userReserved) {
            clearCarsFromMap(true)
            getCars(self.location!)
        }
        
        if (CarBrowseViewController.filtersApplied) {
            clearCarsFromMap(true)
            getCars(self.location!)
            self.titleLabel.text = "Applying your filters..."
            carData = []
            self.tableView.reloadData()
        } else if (ViewController.behaviorDemo) {
            self.titleLabel.text = "Loading..."
        }
        
        if (ViewController.behaviorDemo) {
            locationIcon.hidden = true
        }
        
        super.viewWillAppear(animated)
    }
    @IBAction func onHomeButtonTapped(sender: UIButton) {
        self.tabBarController?.navigationController?.popToRootViewControllerAnimated(true)
    }
    
    func getCars(location: CLLocationCoordinate2D) {
        let lat = location.latitude
        let lng = location.longitude
        let url: NSURL
        
        if (CarBrowseViewController.pickupDate != nil && CarBrowseViewController.dropoffDate != nil) {
            url = NSURL(string: "\(API.carsNearby)/\(lat)/\(lng)/\((CarBrowseViewController.pickupDate)!)/\((CarBrowseViewController.dropoffDate)!)")!
        } else {
            url = NSURL(string: "\(API.carsNearby)/\(lat)/\(lng)")!
        }
        
        let request: NSMutableURLRequest = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "GET"
        
        API.doRequest(request) { (response, jsonArray) -> Void in
            dispatch_async(dispatch_get_main_queue(), {
                self.clearCarsFromMap(true)
                self.carData = CarData.fromDictionary(jsonArray)
                if (ViewController.behaviorDemo && !CarBrowseViewController.userOwnDeviceCreated) {
                    if(self.carData.indexOf({$0.deviceID == ViewController.mobileAppDeviceId}) < 0){
                        // create user own device locally. 
                        // Once its created in server-side as result of getCredentials, stop this.
                        let carInfo: NSDictionary = [
                            "deviceID": ViewController.mobileAppDeviceId,
                            "name": "User owened car",
                            "model": [
                                "stars": 5,
                                "makeModel": "User's device",
                                "year": 2016,
                                "mileage": 0,
                                "thumbnailURL": "\(API.connectedAppURL)/images/car_icon.png",
                                "hourlyRate": 0,
                                "dailyRate": 0
                            ],
                            "distance": 0,
                            "lat": lat, "lng": lng];
                        self.carData.append(CarData.init(dictionary: carInfo))
                    }else{
                        CarBrowseViewController.userOwnDeviceCreated = true
                    }
                }
            
                // add annotations to the map
                self.mapView.addAnnotations(self.carData)
                
                // update label indicating the number of cars
                //TODO: localize this string
                switch self.carData.count {
                case 0: self.titleLabel.text = "There are no cars available."
                case 1: self.titleLabel.text = "There is one car available."
                default: self.titleLabel.text = "There are \(self.carData.count) cars available."
                }
                
                self.carData.sortInPlace({$0.distance < $1.distance})
                if (CarBrowseViewController.pickupDate != nil && CarBrowseViewController.dropoffDate != nil) {
                    self.carData.sortInPlace({$0.rate > $1.rate})
                }
                
                // my device should be always displayed at top
                if(ViewController.behaviorDemo){
                    let mydeviceindex = self.carData.indexOf({$0.deviceID == ViewController.mobileAppDeviceId});
                    if(mydeviceindex > 0){
                        self.carData.insert(self.carData.removeAtIndex(mydeviceindex!), atIndex: 0)
                    }
                }
            
                self.tableView.reloadData()
                
                CarBrowseViewController.userReserved = false
                CarBrowseViewController.filtersApplied = false
                
                if(self.carData.count > 0){
                    var points: [CLLocationCoordinate2D] = [CLLocationCoordinate2D]()
                
                    for car in self.carData {
                        points.append(CLLocationCoordinate2DMake(car.lat!, car.lng!))
                    }
                    points.append(self.location!)
                    let polyline = MKPolyline(coordinates: UnsafeMutablePointer(points), count: points.count)
                
                    self.mapView.addOverlay(polyline)
                    self.mapRect = self.mapView.mapRectThatFits(polyline.boundingMapRect, edgePadding: UIEdgeInsetsMake(50, 50, 50, 50))
                    if self.mapRect?.size.width < CarBrowseViewController.MIN_MAP_RECT_WIDTH {
                        self.mapRect?.size.width = CarBrowseViewController.MIN_MAP_RECT_WIDTH
                        self.mapRect?.origin.x = (self.mapRect?.origin.x)! - CarBrowseViewController.MIN_MAP_RECT_WIDTH/2
                    }
                    if self.mapRect?.size.height < CarBrowseViewController.MIN_MAP_RECT_HEIGHT {
                        self.mapRect?.size.height = CarBrowseViewController.MIN_MAP_RECT_HEIGHT
                        self.mapRect?.origin.y = (self.mapRect?.origin.y)! - CarBrowseViewController.MIN_MAP_RECT_HEIGHT/2
                    }
                
                    self.mapView.setVisibleMapRect(self.mapRect!, animated: true)
                }
            })
        }
    }
    
    func clearCarsFromMap(carsOnly: Bool) {
        for annotation in mapView.annotations {
            if annotation is CarData {
                mapView.removeAnnotation(annotation)
            } else if !carsOnly {
                mapView.removeAnnotation(annotation)
            }
        }
    }
    
    // MARK: - Navigation
    override func prepareForSegue(segue: UIStoryboardSegue, sender: AnyObject?) {
        if(segue.destinationViewController.isKindOfClass(CarDetailsViewController)){
            let targetController: CarDetailsViewController = segue.destinationViewController as! CarDetailsViewController
            
            if let tableCell: UITableViewCell = sender as? UITableViewCell {
                if let selectedIndex: NSIndexPath! = self.tableView.indexPathForCell(tableCell) {
                    targetController.car = self.carData[selectedIndex!.item]
                }
            } else if let annotation: MKAnnotation = sender as? MKAnnotation {
                if let car = annotation as? CarData {
                    targetController.car = car
                }
            }
        }
    }
    
    @IBAction func exitToCarBrowseScreen(segue: UIStoryboardSegue, sender: AnyObject?) {
        // Needed to jump back to this screen from 
        // CreateReservationViewController (or anything else that needs to reset)
    }
    
    func setupPicker() {
        let screenWidth = UIScreen.mainScreen().bounds.size.width
        let screenHeight = UIScreen.mainScreen().bounds.size.height
        
        pickerView = UIView(frame: CGRectMake(0.0, screenHeight, screenWidth, 260))
        
        locationPicker = UIPickerView(frame: CGRectMake(0.0, 44.0, screenWidth, 216.0))
        locationPicker.delegate = self
        locationPicker.dataSource = self
        locationPicker.showsSelectionIndicator = true
        locationPicker.backgroundColor = UIColor.whiteColor()
        
        let pickerToolbar = UIToolbar()
        pickerToolbar.barStyle = UIBarStyle.BlackTranslucent
        pickerToolbar.tintColor = UIColor.whiteColor()
        pickerToolbar.sizeToFit()
        
        let spaceButtonPicker = UIBarButtonItem(barButtonSystemItem: UIBarButtonSystemItem.FlexibleSpace, target: nil, action: nil)
        let cancelButtonPicker = UIBarButtonItem(title: "Done", style: UIBarButtonItemStyle.Plain, target: self, action: #selector(self.donePicker))
        pickerToolbar.setItems([cancelButtonPicker, spaceButtonPicker], animated: false)
        pickerToolbar.userInteractionEnabled = true
        
        pickerView.addSubview(pickerToolbar)
        pickerView.addSubview(locationPicker)
    }
    
    @IBAction func pickLocationAction(sender: AnyObject) {
        self.view.addSubview(pickerView)

        UIView.animateWithDuration(0.2, animations: {
            self.pickerView.frame = CGRectMake(0,
                UIScreen.mainScreen().bounds.size.height - 260.0,
                UIScreen.mainScreen().bounds.size.width, 260.0)
        })
    }
    
    func donePicker(sender: UIBarButtonItem) {
        let row = locationPicker.selectedRowInComponent(0)
        
        UIView.animateWithDuration(0.2, animations: {
            self.pickerView.frame = CGRectMake(0,
                UIScreen.mainScreen().bounds.size.height,
                UIScreen.mainScreen().bounds.size.width, 260.0)
        })
        
        let newLocation = locationData[row]
        
        clearCarsFromMap(false)
        getCars(newLocation)
        
        // added code to set the region to display to hopefully
        // overcome problem Eldad seeing when switching location
        let region = MKCoordinateRegion(
            center: newLocation,
            span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02))
        self.mapView.setRegion(region, animated: true)
        
        mapView.centerCoordinate = newLocation
        
        if (row != 0) {
            let centerAnnotation = MKPointAnnotation()
            centerAnnotation.coordinate = newLocation
            centerAnnotation.title = pickerData[row]
            mapView.addAnnotation(centerAnnotation)
        }
        
        self.location = newLocation
    }
    
}

// MARK: - UITableViewDataSource
extension CarBrowseViewController: UITableViewDataSource {
    
    func numberOfSectionsInTableView(tableView: UITableView) -> Int {
        return 1
    }
    
    func tableView(tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return carData.count
    }
    
    func tableView(tableView: UITableView, cellForRowAtIndexPath indexPath: NSIndexPath) -> UITableViewCell {
        let cellIdentifier = "CarTableViewCell"
        
        let cell = tableView.dequeueReusableCellWithIdentifier(cellIdentifier) as? CarTableViewCell
        
        cell?.backgroundColor = UIColor.whiteColor()
        
        let backgroundView = UIView()
        backgroundView.backgroundColor = Colors.dark
        cell?.selectedBackgroundView = backgroundView
        
        let car = carData[indexPath.row]
        
        cell?.carThumbnail.image = nil
        if CarBrowseViewController.thumbnailCache[car.thumbnailURL!] == nil {
            let url = NSURL(string: (car.thumbnailURL)!)
            dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0)) {
                let data = NSData(contentsOfURL: url!)
                if (data != nil){
                    dispatch_async(dispatch_get_main_queue()) {
                        CarBrowseViewController.thumbnailCache[car.thumbnailURL!] = UIImage(data: data!)
                        cell?.carThumbnail.image = CarBrowseViewController.thumbnailCache[car.thumbnailURL!] as? UIImage
                    }
                }
            }
        } else {
            cell?.carThumbnail.image = CarBrowseViewController.thumbnailCache[car.thumbnailURL!] as? UIImage
        }
        
        cell?.carNameLabel.text = car.name
        cell?.carNameLabel.textColor = Colors.dark
        cell?.carNameLabel.highlightedTextColor = UIColor.whiteColor()
        
        //TODO localize and use real data
        if let distance = car.distance {
            cell?.distanceLabel.text = "\(distance) meters away"
            cell?.distanceLabel.textColor = UIColor(red: 78/255, green: 78/255, blue: 78/255, alpha: 100)
            cell?.distanceLabel.highlightedTextColor = UIColor.whiteColor().colorWithAlphaComponent(0.6)
        }
        
        cell?.ratingLabel.text = String(count: (car.stars)!, repeatedValue: Character("\u{2605}")) + String(count: (5-(car.stars)!), repeatedValue: Character("\u{2606}"))
        
        cell?.ratingLabel.textColor = UIColor(red: 243/255, green: 118/255, blue: 54/255, alpha: 100)
        cell?.ratingLabel.highlightedTextColor = UIColor.whiteColor()
        
        cell?.costLabel.text = "$\((car.hourlyRate)!)/hr, $\((car.dailyRate)!)/day"
        cell?.costLabel.textColor = UIColor.blackColor()
        cell?.costLabel.highlightedTextColor = UIColor.whiteColor()
        
        
        if (indexPath.section==0 && indexPath.row==0) {
            cell?.recommendedImage.image = UIImage(named: "recommended")
        } else {
            cell?.recommendedImage.image = nil
        }
        
        return cell!
    }
}

// MARK: - MKMapViewDelegate
extension CarBrowseViewController: MKMapViewDelegate {
    
    // define what shows on the map for the annotation
    func mapView(mapView: MKMapView, viewForAnnotation annotation: MKAnnotation) -> MKAnnotationView? {
        if annotation is MKUserLocation {
            return nil
        }
        if annotation is MKPointAnnotation {
            let tempView = MKPinAnnotationView(annotation: annotation, reuseIdentifier: "center")
            tempView.canShowCallout = true
            return tempView
        }
        let reuseId = "test"
        
        var anView = mapView.dequeueReusableAnnotationViewWithIdentifier(reuseId)
        if anView == nil {
            anView = MKAnnotationView(annotation: annotation, reuseIdentifier: reuseId)
            anView!.canShowCallout = true
            let pinImage = UIImage(named: "model-s.png")
            
            // set the size of the image - really??
            let size = CGSize(width: 22, height: 20)
            UIGraphicsBeginImageContext(size)
            pinImage!.drawInRect(CGRectMake(0, 0, size.width, size.height))
            let resizedImage = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
            anView!.image = resizedImage
        } else {
            anView?.annotation = annotation
        }
        return anView
    }
    
    func mapView(mapView: MKMapView, didSelectAnnotationView view: MKAnnotationView) {
        if view.annotation is CarData {
            let carPicked = view.annotation as! CarData
            
            var count = 0
            for car in carData {
                if carPicked.deviceID == car.deviceID {
                    tableView.scrollToRowAtIndexPath(NSIndexPath(forRow: count, inSection: 0), atScrollPosition: UITableViewScrollPosition.Top, animated: true)
                } else {
                    count += 1
                }
            }
        }
    }
}

// MARK: - CLLocationManagerDelegate
extension CarBrowseViewController: CLLocationManagerDelegate {
    
    // needed to show the user location in map
    func locationManager(manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]) {
            
            let location = locations.last
            
            let center = CLLocationCoordinate2D(
                latitude: location!.coordinate.latitude,
                longitude: location!.coordinate.longitude)
            
            let region = MKCoordinateRegion(
                center: center,
                span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02))
            
            self.mapView.setRegion(region, animated: true)
            
            self.locationManager.stopUpdatingLocation()
            
            // get cars for the new location
            self.location = center
            self.locationData[0] = center
            getCars(center)
    }
    
    func locationManager(manager: CLLocationManager, didFailWithError error: NSError) {
        print("Errors: " + error.localizedDescription)
    }
}

extension CarBrowseViewController: UIPickerViewDelegate {
    func pickerView(pickerView: UIPickerView, titleForRow row: Int, forComponent component: Int) -> String? {
        return pickerData[row] as String
    }
}

extension CarBrowseViewController: UIPickerViewDataSource {
    
    func numberOfComponentsInPickerView(pickerView: UIPickerView) -> Int {
        return 1
    }
    
    func pickerView(pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
        return pickerData.count
    }
}