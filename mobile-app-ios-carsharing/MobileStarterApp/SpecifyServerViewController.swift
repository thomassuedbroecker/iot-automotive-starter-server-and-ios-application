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

class SpecifyServerViewController: UIViewController {

    @IBOutlet weak var moreInfoButton: UIButton!
    @IBOutlet weak var useDefaultButton: UIButton!
    var serverSpecified = false
    
    override func viewDidLoad() {
        super.viewDidLoad()
        serverSpecified = false
    }

    override func viewWillAppear(animated: Bool) {
        self.navigationController?.setNavigationBarHidden(false, animated: false)
        navigationController?.navigationBar.backItem?.title = ""
        self.title = "Specify Server"
        
        if let appRoute: String = NSUserDefaults.standardUserDefaults().valueForKey(USER_DEFAULTS_KEY_APP_ROUTE) as? String {
            if let url : NSURL = NSURL(string: appRoute) {
                if UIApplication.sharedApplication().canOpenURL(url) {
                    if(serverSpecified){
                        API.doInitialize()
                        performSegueWithIdentifier("goToHomeScreen", sender: self)
                    }
                } else {
                    showError("No valid URL found from data provided:\n\n\(appRoute)")
                    serverSpecified = false
                }
            } else {
                showError("No valid URL found from data provided:\n\n\(appRoute)")
                serverSpecified = false
            }
        }
        
        super.viewWillAppear(animated)
    }
    
    func showError(message: String) {
        let alert = UIAlertController(title: "Scan Error", message: message, preferredStyle: .Alert)
        let okAction = UIAlertAction(title: "OK", style: .Cancel) { action -> Void in
            alert.removeFromParentViewController()
        }
        alert.addAction(okAction)
        presentViewController(alert, animated: true, completion: nil)
    }
    
    @IBAction func useDefaultAction(sender: AnyObject) {
        NSUserDefaults.standardUserDefaults().removeObjectForKey(USER_DEFAULTS_KEY_APP_ROUTE)
        NSUserDefaults.standardUserDefaults().removeObjectForKey(USER_DEFAULTS_KEY_PUSH_APP_GUID)
        NSUserDefaults.standardUserDefaults().removeObjectForKey(USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET)
        NSUserDefaults.standardUserDefaults().removeObjectForKey(USER_DEFAULTS_KEY_MCA_TENANT_ID)
        API.setDefaultServer()
        API.doInitialize()
    }

    @IBAction func moreInfoAction(sender: AnyObject) {
        let url : NSURL = NSURL(string: "http://www.ibm.com/internet-of-things/iot-industry/iot-automotive/")!
        if UIApplication.sharedApplication().canOpenURL(url) {
            UIApplication.sharedApplication().openURL(url)
        }
    }
    override func prepareForSegue(segue: UIStoryboardSegue, sender: AnyObject?) {
        let target :UITabBarController? = segue.destinationViewController as? UITabBarController
        if(segue.identifier == "goToHomeScreen"){
            target?.viewControllers!.removeAtIndex(0) // Drive
            NotificationUtils.initRemoteNotification()
            ViewController.behaviorDemo = false
        }else if(segue.identifier == "goToCodeReader"){
            serverSpecified = true
        }
    }
}
