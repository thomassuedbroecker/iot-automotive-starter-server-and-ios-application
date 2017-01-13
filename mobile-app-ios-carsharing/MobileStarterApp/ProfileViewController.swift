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


class ProfileViewController: UIViewController, MessageViewController {

    @IBOutlet weak var fetchingLabel: UILabel!
    @IBOutlet weak var tableView: UITableView!
    @IBOutlet weak var headerView: UIView!
    
    var stat: DriverStatistics?
    
    var behaviors: [ScoringBehavior] = []
    var timesOfDay: NSDictionary?
    var timesOfDaySortedKeys: [AnyObject]?
    var trafficConditions: NSDictionary?
    var trafficConditionsSortedKeys: [AnyObject]?
    var roadTypes: NSDictionary?
    var roadTypesSortedKeys: [AnyObject]?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        self.tableView.backgroundColor = UIColor.white
        headerView.backgroundColor = Colors.dark
        
        getDriverStats()
    }
    
    override func viewWillAppear(_ animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: true)
        super.viewWillAppear(animated)
        
        self.fetchingLabel.text = "Fetching profile..."
        getDriverStats()
    }
    
    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        // Dispose of any resources that can be recreated.
    }

    func setMessage(_ text: String) {
        self.fetchingLabel.text = text
    }

    func getDriverStats() {
        let url: URL = URL(string: "\(API.driverStats)")!
        let request: NSMutableURLRequest = NSMutableURLRequest(url: url)
        request.httpMethod = "GET"
        
        var stats:[DriverStatistics] = []
        API.doRequest(request) { (response, jsonArray) -> Void in
            stats = DriverStatistics.fromDictionary(jsonArray)
            if stats.count > 0 {
                if let stat: DriverStatistics = stats[0] {
                    DispatchQueue.main.async(execute: {
                        self.stat = stat
                        self.behaviors = stat.scoring!.getScoringBehaviors()
                        self.behaviors.sort(by: {$0.count > $1.count})
                        
                        self.timesOfDay = self.stat?.timeRange?.toDictionary()
                        self.timesOfDay?.setValue(nil, forKey: "totalDistance")
                        self.timesOfDaySortedKeys = (self.timesOfDay! as NSDictionary).keysSortedByValue
                            (comparator: {
                                ($1 as! NSNumber).compare($0 as! NSNumber)
                            })
                        
                        self.roadTypes = self.stat?.roadType?.toDictionary()
                        self.roadTypes?.setValue(nil, forKey: "totalDistance")
                        self.roadTypesSortedKeys = (self.roadTypes! as NSDictionary).keysSortedByValue
                            (comparator: {
                                ($1 as! NSNumber).compare($0 as! NSNumber)
                            })
                        
                        self.trafficConditions = self.stat?.speedPattern?.toDictionary()
                        self.trafficConditions?.setValue(nil, forKey: "totalDistance")
                        self.trafficConditionsSortedKeys = (self.trafficConditions! as NSDictionary).keysSortedByValue
                            (comparator: {
                                ($1 as! NSNumber).compare($0 as! NSNumber)
                            })

                        let totalMiles = round(stat.totalDistance!/16.09344)/100
                        self.fetchingLabel.text = "Your score is \(Int(round(stat.scoring!.score!))) for \(totalMiles) miles."
                        
                        self.tableView.reloadData()
                    })
                }
            } else {
                DispatchQueue.main.async(execute: {
                    self.fetchingLabel.text = "You have no trips."
                    self.tableView.reloadData()
                })
            }
        }
    }
    
    func getValueForIndexPath(_ indexPath: IndexPath, allInfo: Bool) -> (key: String, value: String) {
        var key = ""
        var value = ""
        
        if let _ = self.stat {
            var dict: NSDictionary?
            var totalDistance: Double?
            switch indexPath.section {
            case 0:
                key = self.behaviors[indexPath.row].name!
                value = "\(self.behaviors[indexPath.row].count!)"
                if allInfo {
                    let totalPointsPerBehavior: Double = Double(100 / self.behaviors.count)
                    let pointsForThisBehavior = (self.behaviors[indexPath.row].score! / 100) *  totalPointsPerBehavior
                    let pointsDeducted = Int(round(pointsForThisBehavior - totalPointsPerBehavior))
                    value.append(" (\(pointsDeducted))")
                }
                return (key, value)
            case 1:
                dict = self.timesOfDay
                key = self.timesOfDaySortedKeys![indexPath.row] as! String
                totalDistance = self.stat?.timeRange?.totalDistance
            case 2:
                dict = self.trafficConditions
                key = self.trafficConditionsSortedKeys![indexPath.row] as! String
                totalDistance = self.stat?.speedPattern?.totalDistance
            case 3:
                dict = self.roadTypes
                key = self.roadTypesSortedKeys![indexPath.row] as! String
                totalDistance = self.stat?.roadType?.totalDistance
            default:
                key = "unkonwn"
                value = "unknown"
                return (key, value)
            }
            value = "\(Int(round(((dict?.value(forKey: key))! as! Double) / totalDistance! * 100)))%"
            if allInfo {
                let miles = round(((dict?.value(forKey: key))! as! Double)/16.0934)/100
                value.append(" (\(miles) miles)")
            }
        }
        return (key, value)
    }
}

extension ProfileViewController: UITableViewDelegate {
    func tableView(_ tableView: UITableView, willSelectRowAt indexPath: IndexPath) -> IndexPath? {
        if tableView.indexPathForSelectedRow != nil {
            let selectedIndex = tableView.indexPathForSelectedRow!
            if let cell = tableView.cellForRow(at: selectedIndex) {
                let cellInfo = getValueForIndexPath(selectedIndex, allInfo: false)
                cell.textLabel?.text = cellInfo.key
                cell.detailTextLabel?.text = cellInfo.value
            }
        }
        return indexPath
    }
    
    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        if let cell = tableView.cellForRow(at: indexPath) {
            let cellInfo = getValueForIndexPath(indexPath, allInfo: true)
            cell.detailTextLabel!.text = cellInfo.value
        }
    }
}

extension ProfileViewController: UITableViewDataSource {
    
    func numberOfSections(in tableView: UITableView) -> Int {
        if let _ = stat {
            return 4
        }
        return 1
    }
    
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        if let _ = stat {
            switch section {
                case 0:
                    return self.behaviors.count
                
                case 1:
                    if let _ = self.timesOfDay {
                        return self.timesOfDay!.count
                    }
                    return 0
            
                case 2:
                    if let _ = self.trafficConditions {
                        return self.trafficConditions!.count
                    }
                    return 0
                        
                case 3:
                    if let _ = self.roadTypes {
                        return self.roadTypes!.count
                    }
                    return 0
                
                default: return 0
            }
        }
        return 0
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cellIdentifier = "ProfileViewController-TableViewCell"
        var cell: UITableViewCell! = tableView.dequeueReusableCell(withIdentifier: cellIdentifier)
        if cell == nil {
            cell = UITableViewCell(style: UITableViewCellStyle.value1, reuseIdentifier: cellIdentifier)
            cell.contentView.backgroundColor = UIColor.white
            cell.detailTextLabel?.textColor = UIColor.black
            cell.detailTextLabel?.highlightedTextColor = UIColor.white
            
            cell.textLabel?.textColor = UIColor.black
            cell.textLabel?.highlightedTextColor = UIColor.white
            
            cell.textLabel?.font = UIFont(name: cell.textLabel!.font.fontName, size: 14)
            cell.detailTextLabel?.font = UIFont(name: cell.textLabel!.font.fontName, size: 14)
            
            let backgroundView = UIView()
            backgroundView.backgroundColor = Colors.dark
            cell.selectedBackgroundView = backgroundView
        }

        let cellInfo = getValueForIndexPath(indexPath, allInfo: false)

        cell.textLabel!.text = cellInfo.key
        cell.detailTextLabel!.text = cellInfo.value

        return cell
    }
    
    func tableView(_ tableView: UITableView, viewForHeaderInSection section: Int) -> UIView? {
        let headerView = UIView(frame: CGRect(x: 0, y: 0, width: tableView.bounds.size.width, height: 30))
        let label = UILabel(frame: CGRect(x: 10,y: 0,width: 320,height: 30))
        label.font = UIFont.boldSystemFont(ofSize: 20.0)
        label.textColor = Colors.dark
        
        headerView.backgroundColor = UIColor.white
        headerView.addSubview(label)
        
        if let _ = stat {
            switch section {
                case 0: label.text = "Behaviors"
                case 1: label.text = "Time of day"
                case 2: label.text = "Traffic condition"
                case 3: label.text = "Type of road"
                default: label.text = ""
            }
        }
        
        return headerView
    }
}
