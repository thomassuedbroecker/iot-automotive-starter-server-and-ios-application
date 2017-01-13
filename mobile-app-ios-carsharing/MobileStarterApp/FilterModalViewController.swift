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

class FilterModalViewController: UIViewController {
    
    @IBOutlet weak var pickupTextField: UITextField!
    @IBOutlet weak var dropoffTextField: UITextField!
    
    var pickupDate: Date?
    var dropoffDate: Date?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = DateFormatter.Style.medium
        dateFormatter.timeStyle = DateFormatter.Style.short
        
        pickupDate = Date()
        dropoffDate = Date(timeIntervalSince1970: Date().timeIntervalSince1970 + 7200)
        
        pickupTextField.text = dateFormatter.string(from: pickupDate!)
        dropoffTextField.text = dateFormatter.string(from: dropoffDate!)
        
        setupDatePicker()
    }
    
    override func viewWillAppear(_ animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: false)
        
        super.viewWillAppear(animated)
    }
    
    func setupDatePicker() {
        let datePicker: UIDatePicker = UIDatePicker()
        datePicker.backgroundColor = UIColor.white
        datePicker.datePickerMode = UIDatePickerMode.dateAndTime
        datePicker.minuteInterval = 10
        datePicker.addTarget(self, action: #selector(self.datePickerValueChanged),
                             for: UIControlEvents.valueChanged)
        
        pickupTextField.inputView = datePicker
        dropoffTextField.inputView = datePicker
        
        let pickerToolbar = UIToolbar()
        pickerToolbar.barStyle = UIBarStyle.blackTranslucent
        pickerToolbar.tintColor = UIColor.white
        pickerToolbar.sizeToFit()
        
        let spaceButtonPicker = UIBarButtonItem(barButtonSystemItem: UIBarButtonSystemItem.flexibleSpace, target: nil, action: nil)
        let cancelButtonPicker = UIBarButtonItem(title: "Done", style: UIBarButtonItemStyle.plain, target: self, action: #selector(self.cancelDatePicker))
        pickerToolbar.setItems([cancelButtonPicker, spaceButtonPicker], animated: false)
        pickerToolbar.isUserInteractionEnabled = true
        dropoffTextField.inputAccessoryView = pickerToolbar
        pickupTextField.inputAccessoryView = pickerToolbar
    }
    
    func datePickerValueChanged(_ sender: UIDatePicker) {
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = DateFormatter.Style.medium
        dateFormatter.timeStyle = DateFormatter.Style.short
        if (pickupTextField.isFirstResponder) {
            pickupTextField.text = dateFormatter.string(from: sender.date)
            self.pickupDate = sender.date
        } else {
            dropoffTextField.text = dateFormatter.string(from: sender.date)
            self.dropoffDate = sender.date
        }
    }
    
    func cancelDatePicker(_ sender: UIBarButtonItem) {
        dropoffTextField.resignFirstResponder()
        pickupTextField.resignFirstResponder()
    }
    
    @IBAction func saveAction(_ sender: AnyObject) {
        CarBrowseViewController.pickupDate = Int((self.pickupDate?.timeIntervalSince1970)!)
        CarBrowseViewController.dropoffDate = Int((self.dropoffDate?.timeIntervalSince1970)!)
        CarBrowseViewController.filtersApplied = true
    }
}
