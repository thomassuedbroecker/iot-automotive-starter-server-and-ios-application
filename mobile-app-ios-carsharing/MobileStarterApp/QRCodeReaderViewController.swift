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
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
    }
    
    override func viewWillAppear(_ animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: false)
        self.configureVideoCapture()
        self.addVideoPreviewLayer()
        self.initializeQRView()
    }
    
    func configureVideoCapture() {
        let objCaptureDevice = AVCaptureDevice.defaultDevice(withMediaType: AVMediaTypeVideo)
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
                  message: "Enter the route to the server", preferredStyle: .alert)

            // Add the text field for entering the route manually
            var routeTextField: UITextField?

            alert.addTextField { textField in
                routeTextField = textField
                routeTextField?.placeholder = NSLocalizedString("Application Route", comment: "")
                if let appRoute: String = UserDefaults.standard.value(forKey: USER_DEFAULTS_KEY_APP_ROUTE) as? String {
                    routeTextField?.text = appRoute
                }
            }

            // Add the text field for entering the Push Notifications App Guid manually
            var pushGuidTextField: UITextField?

            alert.addTextField { textField in
                pushGuidTextField = textField
                pushGuidTextField?.placeholder = NSLocalizedString("Push App Guid (optional)", comment: "")
                if let pushAppGUID: String = UserDefaults.standard.value(forKey: USER_DEFAULTS_KEY_PUSH_APP_GUID) as? String {
                    pushGuidTextField?.text = pushAppGUID
                }
            }

            // Add the text field for entering the Push Notifications Client Secret manually
            var pushClientSecretTextField: UITextField?
            
            alert.addTextField { textField in
                pushClientSecretTextField = textField
                pushClientSecretTextField?.placeholder = NSLocalizedString("Push Client Secret (optional)", comment: "")
                if let pushClientSecret: String = UserDefaults.standard.value(forKey: USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET) as? String {
                    pushClientSecretTextField?.text = pushClientSecret
                }
            }
            
            // Add the text field for entering the MCA Tenant Id manually
            var mcaTenantIdTextField: UITextField?
            
            alert.addTextField { textField in
                mcaTenantIdTextField = textField
                mcaTenantIdTextField?.placeholder = NSLocalizedString("MCA Tenant Id (optional)", comment: "")
                if let mcaTenantId: String = UserDefaults.standard.value(forKey: USER_DEFAULTS_KEY_MCA_TENANT_ID) as? String {
                    mcaTenantIdTextField?.text = mcaTenantId
                }
            }

            // Create the actions.
            let cancelAction = UIAlertAction(title: "Cancel", style: .cancel) { action in
                self.navigationController?.popViewController(animated: true)
            }
            
            let okAction = UIAlertAction(title: "OK", style: .default) { action in
                let appRoute = routeTextField?.text
                let pushAppGuid = pushGuidTextField?.text
                let pushClientSecret = pushClientSecretTextField?.text
                let mcaTenatId = mcaTenantIdTextField?.text
                let userDefaults = UserDefaults.standard
                if appRoute != "" {
                    userDefaults.setValue(appRoute, forKey: USER_DEFAULTS_KEY_APP_ROUTE)
                    userDefaults.setValue(pushAppGuid, forKey: USER_DEFAULTS_KEY_PUSH_APP_GUID)
                    userDefaults.setValue(pushClientSecret, forKey: USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET)
                    userDefaults.setValue(mcaTenatId, forKey: USER_DEFAULTS_KEY_MCA_TENANT_ID)
                }
                userDefaults.synchronize()
                self.navigationController?.popViewController(animated: true)
            }

            // Add the actions.
            alert.addAction(cancelAction)
            alert.addAction(okAction)

            self.present(alert, animated: true){}
            return
        }
        
        objCaptureSession = AVCaptureSession()
        objCaptureSession?.addInput(objCaptureDeviceInput as! AVCaptureInput)
        let objCaptureMetadataOutput = AVCaptureMetadataOutput()
        objCaptureSession?.addOutput(objCaptureMetadataOutput)
        objCaptureMetadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
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
        vwQRCode?.layer.borderColor = UIColor.red.cgColor
        vwQRCode?.layer.borderWidth = 5
        self.view.addSubview(vwQRCode!)
        self.view.bringSubview(toFront: vwQRCode!)
    }
    
    func captureOutput(_ captureOutput: AVCaptureOutput!, didOutputMetadataObjects metadataObjects: [Any]!, from connection: AVCaptureConnection!) {
        if metadataObjects == nil || metadataObjects.count == 0 {
            vwQRCode?.frame = CGRect.zero
            return
        }
        let objMetadataMachineReadableCodeObject = metadataObjects[0] as! AVMetadataMachineReadableCodeObject
        if objMetadataMachineReadableCodeObject.type == AVMetadataObjectTypeQRCode {
            let objBarCode = objCaptureVideoPreviewLayer?.transformedMetadataObject(for: objMetadataMachineReadableCodeObject as AVMetadataMachineReadableCodeObject) as! AVMetadataMachineReadableCodeObject
            
            vwQRCode?.frame = objBarCode.bounds;
            
            if objMetadataMachineReadableCodeObject.stringValue != nil {
                let fullString = objMetadataMachineReadableCodeObject.stringValue.components(separatedBy: ",")
                
                if fullString.count == 5 && fullString[0] == "1" && fullString[1] != ""{
                    let appRoute = fullString[1]
                    UserDefaults.standard.setValue(appRoute, forKey: USER_DEFAULTS_KEY_APP_ROUTE)
                    let pushAppGuid = fullString[2]
                    let pushClientSecret = fullString[3]
                    if(pushAppGuid == "" && pushClientSecret == ""){
                        UserDefaults.standard.removeObject(forKey: USER_DEFAULTS_KEY_PUSH_APP_GUID)
                        UserDefaults.standard.removeObject(forKey: USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET)
                    }else if(pushAppGuid != "" && pushClientSecret != ""){
                        UserDefaults.standard.setValue(pushAppGuid, forKey: USER_DEFAULTS_KEY_PUSH_APP_GUID)
                        UserDefaults.standard.setValue(pushClientSecret, forKey: USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET)
                    }
                    let mcaTenantId = fullString[4]
                    if(mcaTenantId == ""){
                        UserDefaults.standard.removeObject(forKey: USER_DEFAULTS_KEY_MCA_TENANT_ID)
                    }else{
                        UserDefaults.standard.setValue(mcaTenantId, forKey: USER_DEFAULTS_KEY_MCA_TENANT_ID)
                    }
                    UserDefaults.standard.synchronize()
                }
            }
        }
        navigationController?.popViewController(animated: true)
    }
}
