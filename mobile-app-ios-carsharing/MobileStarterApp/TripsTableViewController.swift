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

class TripsTableViewController: UIViewController, MessageViewController {
    
    var trips = [TripData]()
    
    @IBOutlet weak var titleLabel: UILabel!
    @IBOutlet weak var tableView: UITableView!
    @IBOutlet weak var headerView: UIView!
    
    var locationCache = [String: String]()
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        tableView.delegate = self
        tableView.dataSource = self
        
        tableView.backgroundColor = UIColor.whiteColor()
        headerView.backgroundColor = Colors.dark

        getTrips()
    }
    
    override func viewWillAppear(animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: true)
        super.viewWillAppear(animated)
        
        self.titleLabel.text = "Fetching trips..."
        getTrips()
    }

    func setMessage(text: String) {
        self.titleLabel.text = text
    }

    func getTrips() {
        let url = NSURL(string: "\(API.tripBehavior)?all=true")!
        let request: NSMutableURLRequest = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "GET"
        
        API.doRequest(request) { (response, jsonArray) -> Void in
            dispatch_async(dispatch_get_main_queue(), {
                self.trips = TripData.fromDictionary(jsonArray)
                
                switch self.trips.count {
                case 0: self.titleLabel.text = "You have no trips."
                case 1: self.titleLabel.text = "You have 1 trip."
                default: self.titleLabel.text = "You have \(self.trips.count) trips."
                }
                
                self.trips.sortInPlace({$0.start_time > $1.start_time})

                print("found \(self.trips.count) trips")
                self.tableView.reloadData()
            })
        }
    }

    // MARK: - Navigation
    override func prepareForSegue(segue: UIStoryboardSegue, sender: AnyObject?) {
        if segue.destinationViewController is TripViewController {
            let targetController: TripViewController = segue.destinationViewController as! TripViewController
            
            if let tableCell: UITableViewCell = sender as? UITableViewCell {
                if let selectedIndex = self.tableView.indexPathForCell(tableCell) {
                    targetController.tripData = self.trips[selectedIndex.item]
                }
            }
        }
    }

}

extension TripsTableViewController: UITableViewDelegate {
    
    func tableView(tableView: UITableView, didSelectRowAtIndexPath indexPath: NSIndexPath) {
        if let cell = tableView.cellForRowAtIndexPath(indexPath) {
            self.performSegueWithIdentifier("showTripSegue", sender: cell)
        }
    }
}

extension TripsTableViewController: UITableViewDataSource {
    
    func numberOfSectionsInTableView(tableView: UITableView) -> Int {
        return 1
    }
    
    func tableView(tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return self.trips.count
    }
    
    func tableView(tableView: UITableView, cellForRowAtIndexPath indexPath: NSIndexPath) -> UITableViewCell {
        let cellIdentifier = "TripsTableViewController-TableViewCell"
        var cell: UITableViewCell! = tableView.dequeueReusableCellWithIdentifier(cellIdentifier)
        if cell == nil {
            cell = UITableViewCell(style: UITableViewCellStyle.Value1, reuseIdentifier: cellIdentifier)
            cell.contentView.backgroundColor = UIColor.whiteColor()
            
            cell.textLabel?.textColor = UIColor.blackColor()
            cell.textLabel?.highlightedTextColor = UIColor.whiteColor()
            cell.textLabel?.font = UIFont(name: cell.textLabel!.font.fontName, size: 14)
            cell.textLabel?.numberOfLines = 2
            
            cell.detailTextLabel?.textColor = UIColor.blackColor()
            cell.detailTextLabel?.highlightedTextColor = UIColor.whiteColor()
            cell.detailTextLabel?.font = UIFont(name: cell.textLabel!.font.fontName, size: 14)
            cell.detailTextLabel?.numberOfLines = 2
            
            let backgroundView = UIView()
            backgroundView.backgroundColor = Colors.dark
            cell.selectedBackgroundView = backgroundView
        }
        
        let trip = self.trips[indexPath.row]
        
        if let _ = trip.start_latitude, _ = trip.start_longitude,
                _ = trip.end_latitude, _ = trip.end_longitude {
            let tempStartLoc = "\(trip.start_latitude!), \(trip.start_longitude!)"
            let tempEndLoc = "\(trip.end_latitude!), \(trip.end_longitude!)"
            cell.textLabel?.text = "\(tempStartLoc)\n\(tempEndLoc)"
            
            getLocation(trip.start_latitude!, start_lng: trip.start_longitude!,
                    end_lat: trip.end_latitude!, end_lng: trip.end_longitude!,
                    startStrToReplace: tempStartLoc, endStrToReplace: tempEndLoc,
                    label: cell.textLabel!)
        } else {
            cell.textLabel?.text = "Unkonwn start location\nUnknown end location"
        }
        
        let dateformatter: NSDateFormatter = NSDateFormatter()
        dateformatter.dateStyle = NSDateFormatterStyle.MediumStyle
        dateformatter.timeStyle = NSDateFormatterStyle.NoStyle
        if let time = trip.start_time {
            cell.detailTextLabel!.text = dateformatter.stringFromDate(NSDate(timeIntervalSince1970: Double(time/1000)))
        } else {
            cell.detailTextLabel!.text = "Unknown date"
        }
        
        if let _ = trip.duration {
            let duration = Int(trip.duration! / 1000 / 60)
            cell.detailTextLabel!.text?.appendContentsOf("\n\(duration)min")
        } else {
            cell.detailTextLabel!.text?.appendContentsOf("\nUknown duration")
        }
        
        if let _ = trip.score {
            let score = Int(round(trip.score!))
            cell.detailTextLabel!.text?.appendContentsOf(", Score \(score)")
        } else {
            cell.detailTextLabel!.text?.appendContentsOf(", Uknown score")
        }
        
        return cell
    }
    
    func getLocation(start_lat: Double, start_lng: Double,
             end_lat: Double, end_lng: Double,
             startStrToReplace: String, endStrToReplace: String,
             label: UILabel) -> Void {
        drawLocation(start_lat, lng: start_lng, strToReplace: startStrToReplace, label: label)
        drawLocation(end_lat, lng: end_lng, strToReplace: endStrToReplace, label: label)
    }
    
    func drawLocation(lat: Double, lng: Double, strToReplace: String, label: UILabel) {
        let gc: CLGeocoder = CLGeocoder()
        let location = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        
        if let value = self.locationCache[strToReplace] {
            if let replaceRange = label.text?.rangeOfString(strToReplace) {
                label.text?.replaceRange(replaceRange, with: value)
            }
        } else {
            gc.reverseGeocodeLocation(CLLocation(latitude: location.latitude, longitude: location.longitude), completionHandler: {
                (placemarks: [CLPlacemark]?, error: NSError?) -> Void in
                dispatch_async(dispatch_get_main_queue(), {
                    if let _ = placemarks {
                        if let placemark = placemarks?[0] {
                            if placemark.name != nil && placemark.locality != nil {
                                if let replaceRange = label.text?.rangeOfString(strToReplace) {
                                    var value = "\(placemark.name!), \(placemark.locality!)"
                                    if let _ = placemark.addressDictionary {
                                        if let street = placemark.addressDictionary!["Thoroughfare"] {
                                            value = "\(street), \(placemark.locality!)"
                                        }
                                    } else {
                                        value = "\(placemark.name!), \(placemark.locality!)"
                                    }
                                    label.text?.replaceRange(replaceRange, with: value)
                                    self.locationCache[strToReplace] = value
                                }
                            } else {
                                // TODO: localize
                                label.text = "unknown location"
                            }
                        }
                    } else {
                        if let _ = error {
                            print("error when getting location: \(error!.code)")
                            if let _ = error?.description {
                                print("error description: \(error!.description)")
                            }
                        }
                    }
                })
            })
        }
    }
}
