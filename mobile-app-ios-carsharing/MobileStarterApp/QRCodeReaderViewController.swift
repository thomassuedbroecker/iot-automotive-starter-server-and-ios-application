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
import AVFoundation

class QRCodeReaderViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate
{
        
    var objCaptureSession:AVCaptureSession?
    var objCaptureVideoPreviewLayer:AVCaptureVideoPreviewLayer?
    var vwQRCode:UIView?
    var sourceViewController: String?
    
    
    override func viewDidLoad() {
        super.viewDidLoad()
    }
    
    override func viewDidAppear(animated: Bool) {
        super.viewDidAppear(animated)
    }
    
    override func viewWillAppear(animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: false)
        self.configureVideoCapture()
        self.addVideoPreviewLayer()
        self.initializeQRView()
    }
    
    func configureVideoCapture() {
        let objCaptureDevice = AVCaptureDevice.defaultDeviceWithMediaType(AVMediaTypeVideo)
        var error:NSError?
        let objCaptureDeviceInput: AnyObject!
        do {
            objCaptureDeviceInput = try AVCaptureDeviceInput(device: objCaptureDevice) as AVCaptureDeviceInput
            
        } catch let error1 as NSError {
            error = error1
            objCaptureDeviceInput = nil
        }
        if (error != nil) {
            let alert = UIAlertController(title: "No camera detected",
                  message: "Enter the route to the server", preferredStyle: .Alert)

            // Add the text field for entering the route manually
            var routeTextField: UITextField?

            alert.addTextFieldWithConfigurationHandler { textField in
                routeTextField = textField
                routeTextField?.placeholder = NSLocalizedString("Application Route", comment: "")
                if let appRoute: String = NSUserDefaults.standardUserDefaults().valueForKey(USER_DEFAULTS_KEY_APP_ROUTE) as? String {
                    routeTextField?.text = appRoute
                }
            }

            // Add the text field for entering the Push Notifications App Guid manually
            var pushGuidTextField: UITextField?

            alert.addTextFieldWithConfigurationHandler { textField in
                pushGuidTextField = textField
                pushGuidTextField?.placeholder = NSLocalizedString("Push App Guid (optional)", comment: "")
                if let pushAppGUID: String = NSUserDefaults.standardUserDefaults().valueForKey(USER_DEFAULTS_KEY_PUSH_APP_GUID) as? String {
                    pushGuidTextField?.text = pushAppGUID
                }
            }

            // Add the text field for entering the Push Notifications Client Secret manually
            var pushClientSecretTextField: UITextField?
            
            alert.addTextFieldWithConfigurationHandler { textField in
                pushClientSecretTextField = textField
                pushClientSecretTextField?.placeholder = NSLocalizedString("Push Client Secret (optional)", comment: "")
                if let pushClientSecret: String = NSUserDefaults.standardUserDefaults().valueForKey(USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET) as? String {
                    pushClientSecretTextField?.text = pushClientSecret
                }
            }
            
            // Add the text field for entering the MCA Tenant Id manually
            var mcaTenantIdTextField: UITextField?
            
            alert.addTextFieldWithConfigurationHandler { textField in
                mcaTenantIdTextField = textField
                mcaTenantIdTextField?.placeholder = NSLocalizedString("MCA Tenant Id (optional)", comment: "")
                if let mcaTenantId: String = NSUserDefaults.standardUserDefaults().valueForKey(USER_DEFAULTS_KEY_MCA_TENANT_ID) as? String {
                    mcaTenantIdTextField?.text = mcaTenantId
                }
            }

            // Create the actions.
            let cancelAction = UIAlertAction(title: "Cancel", style: .Cancel) { action in
                self.navigationController?.popViewControllerAnimated(true)
            }
            
            let okAction = UIAlertAction(title: "OK", style: .Default) { action in
                let appRoute = routeTextField?.text
                let pushAppGuid = pushGuidTextField?.text
                let pushClientSecret = pushClientSecretTextField?.text
                let mcaTenatId = mcaTenantIdTextField?.text
                let userDefaults = NSUserDefaults.standardUserDefaults()
                if appRoute != "" {
                    userDefaults.setValue(appRoute, forKey: USER_DEFAULTS_KEY_APP_ROUTE)
                    userDefaults.setValue(pushAppGuid, forKey: USER_DEFAULTS_KEY_PUSH_APP_GUID)
                    userDefaults.setValue(pushClientSecret, forKey: USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET)
                    userDefaults.setValue(mcaTenatId, forKey: USER_DEFAULTS_KEY_MCA_TENANT_ID)
                }
                userDefaults.synchronize()
                self.navigationController?.popViewControllerAnimated(true)
            }

            // Add the actions.
            alert.addAction(cancelAction)
            alert.addAction(okAction)

            self.presentViewController(alert, animated: true){}
            return
        }
        
        objCaptureSession = AVCaptureSession()
        objCaptureSession?.addInput(objCaptureDeviceInput as! AVCaptureInput)
        let objCaptureMetadataOutput = AVCaptureMetadataOutput()
        objCaptureSession?.addOutput(objCaptureMetadataOutput)
        objCaptureMetadataOutput.setMetadataObjectsDelegate(self, queue: dispatch_get_main_queue())
        objCaptureMetadataOutput.metadataObjectTypes = [AVMetadataObjectTypeQRCode]
    }
    
    func addVideoPreviewLayer() {
        objCaptureVideoPreviewLayer = AVCaptureVideoPreviewLayer(session: objCaptureSession)
        objCaptureVideoPreviewLayer?.videoGravity = AVLayerVideoGravityResizeAspectFill
        objCaptureVideoPreviewLayer?.frame = view.layer.bounds
        self.view.layer.addSublayer(objCaptureVideoPreviewLayer!)
        objCaptureSession?.startRunning()
    }
    
    func initializeQRView() {
        vwQRCode = UIView()
        vwQRCode?.layer.borderColor = UIColor.redColor().CGColor
        vwQRCode?.layer.borderWidth = 5
        self.view.addSubview(vwQRCode!)
        self.view.bringSubviewToFront(vwQRCode!)
    }
    
    func captureOutput(captureOutput: AVCaptureOutput!, didOutputMetadataObjects metadataObjects: [AnyObject]!, fromConnection connection: AVCaptureConnection!) {
        if metadataObjects == nil || metadataObjects.count == 0 {
            vwQRCode?.frame = CGRectZero
            return
        }
        let objMetadataMachineReadableCodeObject = metadataObjects[0] as! AVMetadataMachineReadableCodeObject
        if objMetadataMachineReadableCodeObject.type == AVMetadataObjectTypeQRCode {
            let objBarCode = objCaptureVideoPreviewLayer?.transformedMetadataObjectForMetadataObject(objMetadataMachineReadableCodeObject as AVMetadataMachineReadableCodeObject) as! AVMetadataMachineReadableCodeObject
            
            vwQRCode?.frame = objBarCode.bounds;
            
            if objMetadataMachineReadableCodeObject.stringValue != nil {
                let fullString = objMetadataMachineReadableCodeObject.stringValue.componentsSeparatedByString(",")
                
                if fullString.count == 5 && fullString[0] == "1" && fullString[1] != ""{
                    let appRoute = fullString[1]
                    NSUserDefaults.standardUserDefaults().setValue(appRoute, forKey: USER_DEFAULTS_KEY_APP_ROUTE)
                    let pushAppGuid = fullString[2]
                    let pushClientSecret = fullString[3]
                    if(pushAppGuid == "" && pushClientSecret == ""){
                        NSUserDefaults.standardUserDefaults().removeObjectForKey(USER_DEFAULTS_KEY_PUSH_APP_GUID)
                        NSUserDefaults.standardUserDefaults().removeObjectForKey(USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET)
                    }else if(pushAppGuid != "" && pushClientSecret != ""){
                        NSUserDefaults.standardUserDefaults().setValue(pushAppGuid, forKey: USER_DEFAULTS_KEY_PUSH_APP_GUID)
                        NSUserDefaults.standardUserDefaults().setValue(pushClientSecret, forKey: USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET)
                    }
                    let mcaTenantId = fullString[4]
                    if(mcaTenantId == ""){
                        NSUserDefaults.standardUserDefaults().removeObjectForKey(USER_DEFAULTS_KEY_MCA_TENANT_ID)
                    }else{
                        NSUserDefaults.standardUserDefaults().setValue(mcaTenantId, forKey: USER_DEFAULTS_KEY_MCA_TENANT_ID)
                    }
                    NSUserDefaults.standardUserDefaults().synchronize()
                }
            }
        }
        navigationController?.popViewControllerAnimated(true)
    }
}
