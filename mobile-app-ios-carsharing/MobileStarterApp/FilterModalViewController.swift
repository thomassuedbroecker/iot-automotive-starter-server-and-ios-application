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
    
    var pickupDate: NSDate?
    var dropoffDate: NSDate?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        let dateFormatter = NSDateFormatter()
        dateFormatter.dateStyle = NSDateFormatterStyle.MediumStyle
        dateFormatter.timeStyle = NSDateFormatterStyle.ShortStyle
        
        pickupDate = NSDate()
        dropoffDate = NSDate(timeIntervalSince1970: NSDate().timeIntervalSince1970 + 7200)
        
        pickupTextField.text = dateFormatter.stringFromDate(pickupDate!)
        dropoffTextField.text = dateFormatter.stringFromDate(dropoffDate!)
        
        setupDatePicker()
    }
    
    override func viewWillAppear(animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: false)
        
        super.viewWillAppear(animated)
    }
    
    func setupDatePicker() {
        let datePicker: UIDatePicker = UIDatePicker()
        datePicker.backgroundColor = UIColor.whiteColor()
        datePicker.datePickerMode = UIDatePickerMode.DateAndTime
        datePicker.minuteInterval = 10
        datePicker.addTarget(self, action: #selector(self.datePickerValueChanged),
                             forControlEvents: UIControlEvents.ValueChanged)
        
        pickupTextField.inputView = datePicker
        dropoffTextField.inputView = datePicker
        
        let pickerToolbar = UIToolbar()
        pickerToolbar.barStyle = UIBarStyle.BlackTranslucent
        pickerToolbar.tintColor = UIColor.whiteColor()
        pickerToolbar.sizeToFit()
        
        let spaceButtonPicker = UIBarButtonItem(barButtonSystemItem: UIBarButtonSystemItem.FlexibleSpace, target: nil, action: nil)
        let cancelButtonPicker = UIBarButtonItem(title: "Done", style: UIBarButtonItemStyle.Plain, target: self, action: #selector(self.cancelDatePicker))
        pickerToolbar.setItems([cancelButtonPicker, spaceButtonPicker], animated: false)
        pickerToolbar.userInteractionEnabled = true
        dropoffTextField.inputAccessoryView = pickerToolbar
        pickupTextField.inputAccessoryView = pickerToolbar
    }
    
    func datePickerValueChanged(sender: UIDatePicker) {
        let dateFormatter = NSDateFormatter()
        dateFormatter.dateStyle = NSDateFormatterStyle.MediumStyle
        dateFormatter.timeStyle = NSDateFormatterStyle.ShortStyle
        if (pickupTextField.isFirstResponder()) {
            pickupTextField.text = dateFormatter.stringFromDate(sender.date)
            self.pickupDate = sender.date
        } else {
            dropoffTextField.text = dateFormatter.stringFromDate(sender.date)
            self.dropoffDate = sender.date
        }
    }
    
    func cancelDatePicker(sender: UIBarButtonItem) {
        dropoffTextField.resignFirstResponder()
        pickupTextField.resignFirstResponder()
    }
    
    @IBAction func saveAction(sender: AnyObject) {
        CarBrowseViewController.pickupDate = Int((self.pickupDate?.timeIntervalSince1970)!)
        CarBrowseViewController.dropoffDate = Int((self.dropoffDate?.timeIntervalSince1970)!)
        CarBrowseViewController.filtersApplied = true
    }
}