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
// FIXME: comparison operators with optionals were removed from the Swift Standard Libary.
// Consider refactoring the code to use the non-optional operators.
fileprivate func < <T : Comparable>(lhs: T?, rhs: T?) -> Bool {
  switch (lhs, rhs) {
  case let (l?, r?):
    return l < r
  case (nil, _?):
    return true
  default:
    return false
  }
}

// FIXME: comparison operators with optionals were removed from the Swift Standard Libary.
// Consider refactoring the code to use the non-optional operators.
fileprivate func > <T : Comparable>(lhs: T?, rhs: T?) -> Bool {
  switch (lhs, rhs) {
  case let (l?, r?):
    return l > r
  default:
    return rhs < lhs
  }
}


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
        self.tabBarController?.tabBar.isHidden = false
        
        self.locationManager.desiredAccuracy = kCLLocationAccuracyBest
        self.locationManager.requestWhenInUseAuthorization()
        self.locationManager.startUpdatingLocation()
        self.mapView.showsUserLocation = true
        
        tableView.backgroundColor = UIColor.white

        
        headerView.backgroundColor = Colors.dark
        
        setupPicker()
    }
    
    override func viewWillAppear(_ animated: Bool) {
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
            locationIcon.isHidden = true
        }
        
        super.viewWillAppear(animated)
    }
    @IBAction func onHomeButtonTapped(_ sender: UIButton) {
        self.tabBarController?.navigationController?.popToRootViewController(animated: true)
    }
    
    func getCars(_ location: CLLocationCoordinate2D) {
        let lat = location.latitude
        let lng = location.longitude
        let url: URL
        
        if (CarBrowseViewController.pickupDate != nil && CarBrowseViewController.dropoffDate != nil) {
            url = URL(string: "\(API.carsNearby)/\(lat)/\(lng)/\((CarBrowseViewController.pickupDate)!)/\((CarBrowseViewController.dropoffDate)!)")!
        } else {
            url = URL(string: "\(API.carsNearby)/\(lat)/\(lng)")!
        }
        
        let request: NSMutableURLRequest = NSMutableURLRequest(url: url)
        request.httpMethod = "GET"
        
        API.doRequest(request) { (response, jsonArray) -> Void in
            DispatchQueue.main.async(execute: {
                self.clearCarsFromMap(true)
                self.carData = CarData.fromDictionary(jsonArray)
                if (ViewController.behaviorDemo && !CarBrowseViewController.userOwnDeviceCreated) {
                    if(self.carData.index(where: {$0.deviceID == ViewController.mobileAppDeviceId}) < 0){
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
                
                self.carData.sort(by: {$0.distance < $1.distance})
                if (CarBrowseViewController.pickupDate != nil && CarBrowseViewController.dropoffDate != nil) {
                    self.carData.sort(by: {$0.rate > $1.rate})
                }
                
                // my device should be always displayed at top
                if(ViewController.behaviorDemo){
                    let mydeviceindex = self.carData.index(where: {$0.deviceID == ViewController.mobileAppDeviceId});
                    if(mydeviceindex > 0){
                        self.carData.insert(self.carData.remove(at: mydeviceindex!), at: 0)
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
                
                    self.mapView.add(polyline)
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
    
    func clearCarsFromMap(_ carsOnly: Bool) {
        for annotation in mapView.annotations {
            if annotation is CarData {
                mapView.removeAnnotation(annotation)
            } else if !carsOnly {
                mapView.removeAnnotation(annotation)
            }
        }
    }
    
    // MARK: - Navigation
    override func prepare(for segue: UIStoryboardSegue, sender: Any?) {
        if(segue.destination.isKind(of: CarDetailsViewController.self)){
            let targetController: CarDetailsViewController = segue.destination as! CarDetailsViewController
            
            if let tableCell: UITableViewCell = sender as? UITableViewCell {
                if let selectedIndex: IndexPath? = self.tableView.indexPath(for: tableCell) {
                    targetController.car = self.carData[selectedIndex!.item]
                }
            } else if let annotation: MKAnnotation = sender as? MKAnnotation {
                if let car = annotation as? CarData {
                    targetController.car = car
                }
            }
        }
    }
    
    @IBAction func exitToCarBrowseScreen(_ segue: UIStoryboardSegue, sender: AnyObject?) {
        // Needed to jump back to this screen from 
        // CreateReservationViewController (or anything else that needs to reset)
    }
    
    func setupPicker() {
        let screenWidth = UIScreen.main.bounds.size.width
        let screenHeight = UIScreen.main.bounds.size.height
        
        pickerView = UIView(frame: CGRect(x: 0.0, y: screenHeight, width: screenWidth, height: 260))
        
        locationPicker = UIPickerView(frame: CGRect(x: 0.0, y: 44.0, width: screenWidth, height: 216.0))
        locationPicker.delegate = self
        locationPicker.dataSource = self
        locationPicker.showsSelectionIndicator = true
        locationPicker.backgroundColor = UIColor.white
        
        let pickerToolbar = UIToolbar()
        pickerToolbar.barStyle = UIBarStyle.blackTranslucent
        pickerToolbar.tintColor = UIColor.white
        pickerToolbar.sizeToFit()
        
        let spaceButtonPicker = UIBarButtonItem(barButtonSystemItem: UIBarButtonSystemItem.flexibleSpace, target: nil, action: nil)
        let cancelButtonPicker = UIBarButtonItem(title: "Done", style: UIBarButtonItemStyle.plain, target: self, action: #selector(self.donePicker))
        pickerToolbar.setItems([cancelButtonPicker, spaceButtonPicker], animated: false)
        pickerToolbar.isUserInteractionEnabled = true
        
        pickerView.addSubview(pickerToolbar)
        pickerView.addSubview(locationPicker)
    }
    
    @IBAction func pickLocationAction(_ sender: AnyObject) {
        self.view.addSubview(pickerView)

        UIView.animate(withDuration: 0.2, animations: {
            self.pickerView.frame = CGRect(x: 0,
                y: UIScreen.main.bounds.size.height - 260.0,
                width: UIScreen.main.bounds.size.width, height: 260.0)
        })
    }
    
    func donePicker(_ sender: UIBarButtonItem) {
        let row = locationPicker.selectedRow(inComponent: 0)
        
        UIView.animate(withDuration: 0.2, animations: {
            self.pickerView.frame = CGRect(x: 0,
                y: UIScreen.main.bounds.size.height,
                width: UIScreen.main.bounds.size.width, height: 260.0)
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
    
    func numberOfSections(in tableView: UITableView) -> Int {
        return 1
    }
    
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return carData.count
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cellIdentifier = "CarTableViewCell"
        
        let cell = tableView.dequeueReusableCell(withIdentifier: cellIdentifier) as? CarTableViewCell
        
        cell?.backgroundColor = UIColor.white
        
        let backgroundView = UIView()
        backgroundView.backgroundColor = Colors.dark
        cell?.selectedBackgroundView = backgroundView
        
        let car = carData[indexPath.row]
        
        cell?.carThumbnail.image = nil
        if CarBrowseViewController.thumbnailCache[car.thumbnailURL!] == nil {
            let url = URL(string: (car.thumbnailURL)!)
            DispatchQueue.global(priority: DispatchQueue.GlobalQueuePriority.default).async {
                let data = try? Data(contentsOf: url!)
                if (data != nil){
                    DispatchQueue.main.async {
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
        cell?.carNameLabel.highlightedTextColor = UIColor.white
        
        //TODO localize and use real data
        if let distance = car.distance {
            cell?.distanceLabel.text = "\(distance) meters away"
            cell?.distanceLabel.textColor = UIColor(red: 78/255, green: 78/255, blue: 78/255, alpha: 100)
            cell?.distanceLabel.highlightedTextColor = UIColor.white.withAlphaComponent(0.6)
        }
        
        cell?.ratingLabel.text = String(repeating: "\u{2605}", count: (car.stars)!) + String(repeating: "\u{2606}", count: (5-(car.stars)!))
        
        cell?.ratingLabel.textColor = UIColor(red: 243/255, green: 118/255, blue: 54/255, alpha: 100)
        cell?.ratingLabel.highlightedTextColor = UIColor.white
        
        cell?.costLabel.text = "$\((car.hourlyRate)!)/hr, $\((car.dailyRate)!)/day"
        cell?.costLabel.textColor = UIColor.black
        cell?.costLabel.highlightedTextColor = UIColor.white
        
        
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
    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        if annotation is MKUserLocation {
            return nil
        }
        if annotation is MKPointAnnotation {
            let tempView = MKPinAnnotationView(annotation: annotation, reuseIdentifier: "center")
            tempView.canShowCallout = true
            return tempView
        }
        let reuseId = "test"
        
        var anView = mapView.dequeueReusableAnnotationView(withIdentifier: reuseId)
        if anView == nil {
            anView = MKAnnotationView(annotation: annotation, reuseIdentifier: reuseId)
            anView!.canShowCallout = true
            let pinImage = UIImage(named: "model-s.png")
            
            // set the size of the image - really??
            let size = CGSize(width: 22, height: 20)
            UIGraphicsBeginImageContext(size)
            pinImage!.draw(in: CGRect(x: 0, y: 0, width: size.width, height: size.height))
            let resizedImage = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
            anView!.image = resizedImage
        } else {
            anView?.annotation = annotation
        }
        return anView
    }
    
    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        if view.annotation is CarData {
            let carPicked = view.annotation as! CarData
            
            var count = 0
            for car in carData {
                if carPicked.deviceID == car.deviceID {
                    tableView.scrollToRow(at: IndexPath(row: count, section: 0), at: UITableViewScrollPosition.top, animated: true)
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
    func locationManager(_ manager: CLLocationManager,
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
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Errors: " + error.localizedDescription)
    }
}

extension CarBrowseViewController: UIPickerViewDelegate {
    func pickerView(_ pickerView: UIPickerView, titleForRow row: Int, forComponent component: Int) -> String? {
        return pickerData[row] as String
    }
}

extension CarBrowseViewController: UIPickerViewDataSource {
    
    func numberOfComponents(in pickerView: UIPickerView) -> Int {
        return 1
    }
    
    func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
        return pickerData.count
    }
}
