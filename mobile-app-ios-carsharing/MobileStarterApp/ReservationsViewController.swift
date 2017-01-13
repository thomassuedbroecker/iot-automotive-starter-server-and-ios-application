//
//  ReservationsViewController.swift
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

class ReservationsViewController: UIViewController, MessageViewController {

    @IBOutlet weak var titleLabel: UILabel!
    @IBOutlet weak var tableView: UITableView!
    @IBOutlet weak var headerView: UIView!
    
    var reservations: [ReservationsData] = []
    
    static var userReserved: Bool = true
    
    override func viewWillAppear(animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: false)
        
        tableView.backgroundColor = UIColor.whiteColor()
        headerView.backgroundColor = Colors.dark

        self.titleLabel.text = "Fetching reservations..."

        if (ReservationsViewController.userReserved || self.reservations.count == 0) {
            ReservationsViewController.userReserved = false
            getReservations()
        }
    }

    func setMessage(text: String) {
        self.titleLabel.text = text
    }

    func getReservations() {
        let url = NSURL(string: API.reservations)!
        let request = NSMutableURLRequest(URL: url)
        request.HTTPMethod = "GET"
        
        API.doRequest(request) { (response, jsonArray) -> Void in
            dispatch_async(dispatch_get_main_queue(), {
                self.reservations = ReservationsData.fromDictionary(jsonArray)
                switch self.reservations.count {
                case 0: self.titleLabel.text = "You have no reservations."
                case 1: self.titleLabel.text = "You have one reservation."
                default: self.titleLabel.text = "You have \(self.reservations.count) reservations."
                }
                self.tableView.reloadData()
            })
        }
    }
    
    // MARK: - Navigation
    override func prepareForSegue(segue: UIStoryboardSegue, sender: AnyObject?) {
        
        let targetController: CompleteReservationViewController = segue.destinationViewController as! CompleteReservationViewController
        
        if let tableCell: UITableViewCell = sender as? UITableViewCell {
            if let selectedIndex: NSIndexPath! = self.tableView.indexPathForCell(tableCell) {
                targetController.reservation = self.reservations[selectedIndex!.item]
            }
        }else if let reservation = sender as? ReservationsData {
            targetController.reservation = reservation
        }
    }
}

// MARK: - UITableViewDataSource
extension ReservationsViewController: UITableViewDataSource {
    func numberOfSectionsInTableView(tableView: UITableView) -> Int {
        return 1
    }
    
    func tableView(tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return reservations.count
    }
    
    func tableView(tableView: UITableView, cellForRowAtIndexPath indexPath: NSIndexPath) -> UITableViewCell {
        let cellIdentifier = "ReservationsTableViewCell"
        let cell = tableView.dequeueReusableCellWithIdentifier(cellIdentifier, forIndexPath: indexPath) as! ReservationsTableViewCell
        cell.backgroundColor = UIColor.whiteColor()
        let backgroundView = UIView()
        backgroundView.backgroundColor = Colors.dark
        cell.selectedBackgroundView = backgroundView

        let reservation = reservations[indexPath.row]
        
        cell.carReservationThumbnail.image = nil
                
        if CarBrowseViewController.thumbnailCache[(reservation.carDetails?.thumbnailURL)!] == nil {
            let url = NSURL(string: (reservation.carDetails?.thumbnailURL)!)
            
            dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0)) {
                let data = NSData(contentsOfURL: url!)
                if data != nil {
                    dispatch_async(dispatch_get_main_queue()) {
                        CarBrowseViewController.thumbnailCache[(reservation.carDetails?.thumbnailURL)!] = UIImage(data: data!)
                        cell.carReservationThumbnail.image = CarBrowseViewController.thumbnailCache[(reservation.carDetails?.thumbnailURL)!] as? UIImage
                    }
                }
            }
        } else {
            cell.carReservationThumbnail.image = CarBrowseViewController.thumbnailCache[(reservation.carDetails?.thumbnailURL)!] as? UIImage
        }
        
        cell.nameLabel.text = reservation.carDetails?.name
        cell.nameLabel.textColor = Colors.dark
        cell.nameLabel.highlightedTextColor = UIColor.whiteColor()
        
        let dateformatter: NSDateFormatter = NSDateFormatter()
        dateformatter.dateStyle = NSDateFormatterStyle.ShortStyle
        dateformatter.timeStyle = NSDateFormatterStyle.ShortStyle
        if let dropoffTime = reservation.dropOffTime {
            cell.dropOffTimeLabel.text = dateformatter.stringFromDate(NSDate(timeIntervalSince1970: dropoffTime))
        }
        
        if let carDetails = reservation.carDetails {
            if let latTemp = carDetails.lat, longTemp = carDetails.lng {
                API.getLocation(latTemp, lng: longTemp, label: cell.dropOffLocationLabel)
            } else {
                cell.dropOffLocationLabel.text = "Uknown location"
            }
            
        } else {
            //TODO: handle error condition better
            print("Unable to get car details from reservation \(reservation._id)")
        }
        
        cell.dropOffTimeLabel.textColor = UIColor.blackColor()
        cell.dropOffTimeLabel.highlightedTextColor = UIColor.whiteColor()
        
        return cell
    }
    
    func tableView(tableView: UITableView, canEditRowAtIndexPath indexPath: NSIndexPath) -> Bool {
        return false
    }
}
