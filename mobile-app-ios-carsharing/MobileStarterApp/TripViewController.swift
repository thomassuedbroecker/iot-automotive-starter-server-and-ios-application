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

class TripViewController: UIViewController {
    
    var trip: Trip?
    var tripData: TripData?
    var startLoc: CLLocationCoordinate2D?
    var endLoc: CLLocationCoordinate2D?
    var region: MKCoordinateRegion?
    var behaviors = NSMutableDictionary()
    var mapRect: MKMapRect?
    
    static let MIN_MAP_RECT_WIDTH:Double = 5000
    static let MIN_MAP_RECT_HEIGHT:Double = 10000
    
    @IBOutlet weak var tableView: UITableView!
    @IBOutlet weak var mapView: MKMapView!
    @IBOutlet weak var notAnalyzedLabel: UILabel!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        tableView.backgroundColor = UIColor.whiteColor()
        tableView.delegate = self
        tableView.dataSource = self
        
        mapView.delegate = self
        
        getDriverBehavior()
    }
    
    override func viewWillAppear(animated: Bool) {
        self.navigationController?.setNavigationBarHidden(false, animated: false)
        // remove back button text
        navigationController?.navigationBar.backItem?.title = ""
        
        let topItem = navigationController?.navigationBar.topItem
        
        let dateformatter: NSDateFormatter = NSDateFormatter()
        dateformatter.dateStyle = NSDateFormatterStyle.ShortStyle
        dateformatter.timeStyle = NSDateFormatterStyle.ShortStyle
        var titleString = ""
        if let time = self.tripData!.start_time {
            titleString = dateformatter.stringFromDate(NSDate(timeIntervalSince1970: Double(time/1000)))
        }
        
        let duration: Double? = self.tripData!.duration
        if (duration != nil){
            titleString.appendContentsOf(" (" + String(Int(duration! / 1000 / 60)) + "min)")
        }
        topItem!.title = titleString
        
        super.viewWillAppear(animated)
    }
    
    func getDriverBehavior() {
        let trip_uuid: String? = tripData!.trip_uuid
        if(trip_uuid == nil){
            addStartAndEndToMap()
            tableView.removeConstraints(tableView.constraints)
            notAnalyzedLabel.addConstraint(NSLayoutConstraint(
                item:notAnalyzedLabel,
                attribute:NSLayoutAttribute.Height,
                relatedBy:NSLayoutRelation.Equal,
                toItem:nil,
                attribute:NSLayoutAttribute.Height,
                multiplier:1,
                constant:40
            ))
            let trip_id = tripData!.trip_id
            let url: NSURL = NSURL(string: "\(API.tripAnalysisStatus)/\(trip_id!)")!
            let request: NSMutableURLRequest = NSMutableURLRequest(URL: url)
            request.HTTPMethod = "GET"
            API.doRequest(request){ (response, jsonArray) -> Void in
                if jsonArray.count > 0 {
                    let status = jsonArray[0]
                    dispatch_async(dispatch_get_main_queue(), {
                        self.notAnalyzedLabel.text = status["message"] as? String
                    })
                }
            }
            return
        }
        notAnalyzedLabel.addConstraint(NSLayoutConstraint(
            item:notAnalyzedLabel,
            attribute:NSLayoutAttribute.Height,
            relatedBy:NSLayoutRelation.Equal,
            toItem:nil,
            attribute:NSLayoutAttribute.Height,
            multiplier:1,
            constant:0
            ))
        tableView.addConstraint(NSLayoutConstraint(
            item:tableView,
            attribute:NSLayoutAttribute.Height,
            relatedBy:NSLayoutRelation.Equal,
            toItem:tableView,
            attribute:NSLayoutAttribute.Width,
            multiplier:236/375,
            constant:1
            ))
      
        let url: NSURL = NSURL(string: "\(API.tripBehavior)/\(trip_uuid!)")!
        let request: NSMutableURLRequest = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "GET"
        
        var stats:[Trip] = []
        API.doRequest(request) { (response, jsonArray) -> Void in
            stats = Trip.fromDictionary(jsonArray)
            if stats.count > 0 {
                if let stat: Trip = stats[0] {
                    
                    self.trip = stat
                    
                    dispatch_async(dispatch_get_main_queue(), {
                        self.startLoc = CLLocationCoordinate2D(
                            latitude: stat.start_latitude!,
                            longitude: stat.start_longitude!)
                        
                        self.endLoc = CLLocationCoordinate2D(
                            latitude: stat.end_latitude!,
                            longitude: stat.end_longitude!)
                        
                        self.addStartAndEndToMap()
                        
                        let center = self.getMidPoint(self.startLoc!, point2: self.endLoc!)
                        
                        let latDelta = abs(self.startLoc!.latitude - self.endLoc!.latitude) + 0.01
                        let lngDelta = abs(self.startLoc!.longitude - self.endLoc!.longitude) + 0.01
                        
                        self.region = MKCoordinateRegion(
                            center: center,
                            span: MKCoordinateSpan(
                                latitudeDelta: latDelta,
                                longitudeDelta: lngDelta))
                        
                        self.buildBehaviorData()
                        
                        self.tableView.reloadData()
                    })
                }
            }
        }
    }
    
    func addStartAndEndToMap() {
        if(self.startLoc != nil){
            let startAnnotation = MKPointAnnotation()
            startAnnotation.coordinate = self.startLoc!
            startAnnotation.title = "Start of Trip"
            self.mapView.addAnnotation(startAnnotation)
        }
        
        if(self.endLoc != nil){
            let endAnnotation = MKPointAnnotation()
            endAnnotation.coordinate = self.endLoc!
            endAnnotation.title = "End of Trip"
            self.mapView.addAnnotation(endAnnotation)
        }
        
        let url: NSURL = NSURL(string: "\(API.tripRoutes)/" + (tripData?.trip_id)!)!
        let request: NSMutableURLRequest = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "GET"
        
        var stats:[Path] = []
        API.doRequest(request) { (response, jsonArray) -> Void in
            stats = Path.fromDictionary(jsonArray)
            if stats.count > 0 {
                if let stat: Path = stats[0] {
                    dispatch_async(dispatch_get_main_queue(), {
                        var points: [CLLocationCoordinate2D] = [CLLocationCoordinate2D]()
                        
                        for coordinate in stat.coordinates! {
                            points.append(CLLocationCoordinate2DMake(coordinate[1].doubleValue!, coordinate[0].doubleValue!))
                        }
                        let polyline = MKPolyline(coordinates: UnsafeMutablePointer(points), count: points.count)
                        
                        self.mapView.addOverlay(polyline)
                        self.mapRect = self.mapView.mapRectThatFits(polyline.boundingMapRect, edgePadding: UIEdgeInsetsMake(50, 50, 50, 50))
                        if self.mapRect?.size.width < TripViewController.MIN_MAP_RECT_WIDTH {
                            self.mapRect?.size.width = TripViewController.MIN_MAP_RECT_WIDTH
                            self.mapRect?.origin.x = (self.mapRect?.origin.x)! - TripViewController.MIN_MAP_RECT_WIDTH/2
                        }
                        if self.mapRect?.size.height < TripViewController.MIN_MAP_RECT_HEIGHT {
                            self.mapRect?.size.height = TripViewController.MIN_MAP_RECT_HEIGHT
                            self.mapRect?.origin.y = (self.mapRect?.origin.y)! - TripViewController.MIN_MAP_RECT_HEIGHT/2
                        }

                        self.mapView.setVisibleMapRect(self.mapRect!, animated: true)
                    })
                }
            }
        }
        
        
        
//        self.mapView.setRegion(MKCoordinateRegionForMapRect(polygon boundingMapRect), animated: true)
    }
    
    func buildBehaviorData() {
        let locations: [TripLocation] = trip!.locations!
        for location: TripLocation in locations {
            if let tripBehaviors: [TripBehavior] = location.behaviors {
                for behavior: TripBehavior in tripBehaviors {
                    //var array: [MKPointAnnotation]?
                    var array: [MKPolyline]?
                    if self.behaviors.objectForKey(behavior.behavior_name!) == nil {
                        array = [MKPolyline]()
                        self.behaviors.setValue(array, forKey: behavior.behavior_name!)
                    } else {
                        array = self.behaviors.objectForKey(behavior.behavior_name!) as? [MKPolyline]
                    }
                    
                    var coordinateArray = [CLLocationCoordinate2D]()
                    coordinateArray.append(CLLocationCoordinate2DMake(behavior.start_latitude!, behavior.start_longitude!))
                    coordinateArray.append(CLLocationCoordinate2DMake(behavior.end_latitude!, behavior.end_longitude!))
                    let line = MKPolyline(coordinates: &coordinateArray, count: 2)
                    
                    array?.append(line)
                    
                    // odd that I need to do this, getting the array out of the dictionary doesn't return a pointer
                    // to that array??
                    self.behaviors.setValue(array, forKey: behavior.behavior_name!)
                }
            }
        }
    }
    
    func toDegrees(x: Double) -> Double {
        return x * 180.0 / M_PI
    }
    
    func toRadians(x: Double) -> Double {
        return x * M_PI / 180
    }
    
    func getMidPoint(point1 : CLLocationCoordinate2D, point2 : CLLocationCoordinate2D) -> CLLocationCoordinate2D {
        let p1lat = toRadians(point1.latitude);
        let p2lat = toRadians(point2.latitude);
        let dLon: CLLocationDegrees = toRadians(point2.longitude - point1.longitude);
        let bx: CLLocationDegrees = cos(p2lat) * cos(dLon);
        let by: CLLocationDegrees = cos(p2lat) * sin(dLon);
        let latitude: CLLocationDegrees = atan2(sin(p1lat) + sin(p2lat), sqrt((cos(p1lat) + bx) * (cos(p1lat) + bx) + by*by));
        let longitude: CLLocationDegrees = toRadians(point1.longitude) + atan2(by, cos(p1lat) + bx);
        
        var midpointCoordinate = CLLocationCoordinate2D()
        midpointCoordinate.longitude = toDegrees(longitude);
        midpointCoordinate.latitude = toDegrees(latitude);
        
        return midpointCoordinate;
    }
    
    
}

extension TripViewController: UITableViewDelegate {
    
    func tableView(tableView: UITableView, didSelectRowAtIndexPath indexPath: NSIndexPath) {
        self.mapView.setVisibleMapRect(self.mapRect!, animated: true)
        
        if let array: [MKPolyline] = behaviors.valueForKey((behaviors.allKeys[indexPath.row] as? String)!) as? [MKPolyline] {
            for overlay in mapView.overlays {
                if (overlay.title! == "behavior") {
                    mapView.removeOverlay(overlay)
                }
            }
            for line in array {
                line.title = "behavior"
                mapView.addOverlay(line)
            }
        }
    }
    
}

extension TripViewController: UITableViewDataSource {
    
    func numberOfSectionsInTableView(tableView: UITableView) -> Int {
        return 1
    }
    
    func tableView(tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return behaviors.allKeys.count
    }
    
    func tableView(tableView: UITableView, cellForRowAtIndexPath indexPath: NSIndexPath) -> UITableViewCell {
        let cellIdentifier = "TripViewController-TableViewCell"
        var cell: UITableViewCell! = tableView.dequeueReusableCellWithIdentifier(cellIdentifier)
        
        if cell == nil {
            cell = UITableViewCell(style: UITableViewCellStyle.Value1, reuseIdentifier: cellIdentifier)
            cell.contentView.backgroundColor = UIColor.whiteColor()
            cell.detailTextLabel?.textColor = UIColor.blackColor()
            cell.detailTextLabel?.highlightedTextColor = UIColor.whiteColor()
            
            cell.textLabel?.textColor = UIColor.blackColor()
            cell.textLabel?.highlightedTextColor = UIColor.whiteColor()
            cell.textLabel?.font = UIFont(name: cell.textLabel!.font.fontName, size: 12)
            
            cell.detailTextLabel?.font = UIFont(name: cell.textLabel!.font.fontName, size: 12)
            let backgroundView = UIView()
            backgroundView.backgroundColor = Colors.dark
            cell.selectedBackgroundView = backgroundView
        }
        
        if let name = behaviors.allKeys[indexPath.row] as? String {
            cell.textLabel?.text = name
            if let array = behaviors.objectForKey(name) as? [MKPointAnnotation] {
                cell.detailTextLabel?.text = "\(array.count/2) occurrences"
            } else if let array = behaviors.objectForKey(name) as? [MKPolyline] {
                cell.detailTextLabel?.text = array.count > 1 ? "\(array.count) occurrences" : "1 occurrence"
            }
        }
        return cell
    }
}

extension TripViewController: MKMapViewDelegate {
    func mapView(mapView: MKMapView, viewForAnnotation annotation: MKAnnotation) -> MKAnnotationView? {
        let newAnnotation = MKPinAnnotationView(annotation: annotation, reuseIdentifier: "myAnnotationView")
        let pointAnnotation = annotation as! MKPointAnnotation
        let asRange = pointAnnotation.title?.rangeOfString("Start")
        if let asRange = asRange where asRange.startIndex == pointAnnotation.title?.startIndex {
            newAnnotation.pinColor = .Green
        } else {
            newAnnotation.pinColor = .Red
        }
        newAnnotation.animatesDrop = true
        newAnnotation.canShowCallout = true
        newAnnotation.setSelected(true, animated: true)
        return newAnnotation;
    }
    
    func mapView(mapView: MKMapView, rendererForOverlay overlay: MKOverlay) -> MKOverlayRenderer {
        if overlay is MKPolyline {
            let lineRenderer = MKPolylineRenderer(polyline: overlay as! MKPolyline)
            
            if (overlay.title! == "behavior") {
                lineRenderer.strokeColor = UIColor.redColor()
                lineRenderer.lineWidth = 7
                
                return lineRenderer
            } else {
                lineRenderer.strokeColor = Colors.neutral
                lineRenderer.lineWidth = 3
                
                return lineRenderer
            }
        } else {
            return MKPolylineRenderer()
        }
    }
}