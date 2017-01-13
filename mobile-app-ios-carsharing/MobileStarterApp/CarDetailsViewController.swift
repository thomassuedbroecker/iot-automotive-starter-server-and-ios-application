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

class CarDetailsViewController: UIViewController {
    
    var car: CarData?
    
    @IBOutlet weak var carNameLabel: UILabel!
    @IBOutlet weak var ratingLabel: UILabel!
    
    @IBOutlet weak var carDetailsTableView: UITableView!
    
    @IBOutlet weak var reserveCarButton: UIButton!
    
    @IBOutlet weak var carDetailThumbnail: UIImageView!
    
    let sectionHeaderValues = ["Availability", "Specifications", "Reviews"]
    let availabilityLabels = ["Date and time:", "Pick up & drop off at:", "Price:"]
    var availabilityValues = ["", "", ""]
    let specificationsLabels = ["Make and Model:", "Year:", "Mileage:"]
    var specificationsValues: [String] = []
    
    override func viewWillAppear(_ animated: Bool) {
        self.navigationController?.setNavigationBarHidden(false, animated: false)
        navigationController?.navigationBar.backItem?.title = ""
        
        super.viewWillAppear(animated)
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // TODO: localize
        self.title = "Car Details"
        
        self.tabBarController?.tabBar.isHidden = true
       
        // Do any additional setup after loading the view.
        self.carNameLabel.text = car?.name
        
        // TODO: localize
        
        self.carDetailThumbnail.image = CarBrowseViewController.thumbnailCache[(car?.thumbnailURL)!]  as? UIImage
        
        ratingLabel.text = String(repeating: "\u{2605}", count: (car?.stars)!) + String(repeating: "\u{2606}", count: (5-(car?.stars)!))
        
        ratingLabel.textColor = UIColor(red: 243/255, green: 118/255, blue: 54/255, alpha: 100)
        
        carDetailsTableView.dataSource = self
        carDetailsTableView.delegate = self
        carDetailsTableView.rowHeight = 20
        carDetailsTableView.contentInset = UIEdgeInsetsMake(10, 0, 0, 0)
        carDetailsTableView.allowsSelection = true
        carDetailsTableView.allowsMultipleSelection = false
        carDetailsTableView.backgroundColor = UIColor.white
        carDetailsTableView.separatorStyle = UITableViewCellSeparatorStyle.none
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = DateFormatter.Style.short
        dateFormatter.timeStyle = DateFormatter.Style.none
        let pickupDate = Date()
        
        availabilityValues[0] = dateFormatter.string(from: pickupDate)
        availabilityValues[0] += " 8:00AM - 10:00PM"
        
        availabilityValues[2] = "$\((car?.hourlyRate)!)/hr, $\((car?.dailyRate)!)/day"
        
        specificationsValues = [(car?.makeModel)!, String("\((car?.year)!)"), thousandSeparator((car?.mileage)!)]
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        // Dispose of any resources that can be recreated.
    }

    @IBAction func locationButtonAction(_ sender: AnyObject) {
        showMapAtCarCoordinates()
    }
    
    func showMapAtCarCoordinates() {
        let url : URL = URL(string: "http://maps.apple.com/maps?q=\((car?.lat)!),\((car?.lng)!)")!
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.openURL(url)
        }
    }
    
    func thousandSeparator(_ num: Int) -> String {
        let temp = NumberFormatter()
        temp.numberStyle = .decimal
        
        return temp.string(from: NSNumber(num))!
    }
    
    /*
    // MARK: - Navigation

    // In a storyboard-based application, you will often want to do a little preparation before navigation
    override func prepareForSegue(segue: UIStoryboardSegue, sender: AnyObject?) {
        // Get the new view controller using segue.destinationViewController.
        // Pass the selected object to the new view controller.
    }
    */
    // MARK: - Navigation
    override func prepare(for segue: UIStoryboardSegue, sender: Any?) {
        
        let targetController: CreateReservationViewController = segue.destination as! CreateReservationViewController
        
        targetController.car = car
    }
}

// MARK: - UITableViewDataSource
extension CarDetailsViewController: UITableViewDataSource {
    
    func numberOfSections(in tableView: UITableView) -> Int {
        return 3
    }
    
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        if section == 0 {
         return availabilityLabels.count
        } else if section == 1 {
         return specificationsLabels.count
        } else {
         return 1
        }
    }
    
    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        return sectionHeaderValues[section]
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cellIdentifier = "MyIdentifier"
        let cell = UITableViewCell(style: UITableViewCellStyle.value1, reuseIdentifier: cellIdentifier)
        cell.contentView.backgroundColor = UIColor.white
        cell.textLabel?.textColor = UIColor.black
        cell.textLabel?.font = UIFont(name: cell.textLabel!.font.fontName, size: 12)
        cell.detailTextLabel?.textColor = UIColor.black
        cell.detailTextLabel?.font = UIFont(name: cell.textLabel!.font.fontName, size: 12)
        cell.selectionStyle = UITableViewCellSelectionStyle.none
        
        if indexPath.section == 0 {
            cell.textLabel?.text = availabilityLabels[indexPath.row]
            if indexPath.row == 1 {
                API.getLocation((car?.lat)!, lng: (car?.lng)!, label: cell.detailTextLabel!)
            } else {
                cell.detailTextLabel?.text = availabilityValues[indexPath.row]
            }
        } else if indexPath.section == 1 {
            cell.textLabel?.text = specificationsLabels[indexPath.row]
            cell.detailTextLabel?.text = specificationsValues[indexPath.row]
        } else {
            cell.textLabel?.text = "No reviews yet"
        }
        
        return cell
    }
}

// MARK: - UITableViewDelegate
extension CarDetailsViewController: UITableViewDelegate {
    
    func tableView(_ tableView: UITableView, heightForHeaderInSection section: Int) -> CGFloat {
        return 26
    }
    
    // to override the grey background and black text on section headers
    func tableView(_ tableView: UITableView, willDisplayHeaderView view: UIView, forSection section: Int) {
        let myView = view as! UITableViewHeaderFooterView
        myView.tintColor = UIColor.white
        myView.textLabel?.textColor = Colors.dark
    }
    
    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        let cell = tableView.cellForRow(at: indexPath)
        if cell?.textLabel?.text == availabilityLabels[1] {
            showMapAtCarCoordinates()
        }
    }
}

