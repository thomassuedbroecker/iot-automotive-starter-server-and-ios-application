/*
 *     Copyright 2015 IBM Corp.
 *     Licensed under the Apache License, Version 2.0 (the "License");
 *     you may not use this file except in compliance with the License.
 *     You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 *     Unless required by applicable law or agreed to in writing, software
 *     distributed under the License is distributed on an "AS IS" BASIS,
 *     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *     See the License for the specific language governing permissions and
 *     limitations under the License.
 */

import Foundation

#if swift (>=3.0)

internal class SecurityUtils {
    
    private static func savePublicKeyToKeyChain(_ key:SecKey,tag:String) throws {
        let publicKeyAttr : [NSString:AnyObject] = [
            kSecValueRef: key,
            kSecAttrIsPermanent : true as AnyObject,
            kSecAttrApplicationTag : tag as AnyObject,
            kSecAttrKeyClass : kSecAttrKeyClassPublic
            
        ]
        let addStatus:OSStatus = SecItemAdd(publicKeyAttr as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        
        
    }
    private static func getKeyBitsFromKeyChain(_ tag:String) throws -> Data {
        let keyAttr : [NSString:AnyObject] = [
            kSecClass : kSecClassKey,
            kSecAttrApplicationTag: tag as AnyObject,
            kSecAttrKeyType : kSecAttrKeyTypeRSA,
            kSecReturnData : true as AnyObject
        ]
        var result: AnyObject?
        
        let status = SecItemCopyMatching(keyAttr as CFDictionary, &result)
        
        guard status == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        return result as! Data
        
    }
    
    internal static func generateKeyPair(_ keySize:Int, publicTag:String, privateTag:String)throws -> (publicKey: SecKey, privateKey: SecKey) {
        //make sure keys are deleted
        SecurityUtils.deleteKeyFromKeyChain(publicTag)
        SecurityUtils.deleteKeyFromKeyChain(privateTag)
        
        var status:OSStatus = noErr
        var privateKey:SecKey?
        var publicKey:SecKey?
        
        let privateKeyAttr : [NSString:AnyObject] = [
            kSecAttrIsPermanent : true as AnyObject,
            kSecAttrApplicationTag : privateTag as AnyObject,
            kSecAttrKeyClass : kSecAttrKeyClassPrivate
        ]
        
        let publicKeyAttr : [NSString:AnyObject] = [
            kSecAttrIsPermanent : true as AnyObject,
            kSecAttrApplicationTag : publicTag as AnyObject,
            kSecAttrKeyClass : kSecAttrKeyClassPublic,
            ]
        
        let keyPairAttr : [NSString:AnyObject] = [
            kSecAttrKeyType : kSecAttrKeyTypeRSA,
            kSecAttrKeySizeInBits : keySize as AnyObject,
            kSecPublicKeyAttrs : publicKeyAttr as AnyObject,
            kSecPrivateKeyAttrs : privateKeyAttr as AnyObject
        ]
        
        status = SecKeyGeneratePair(keyPairAttr as CFDictionary, &publicKey, &privateKey)
        if (status != errSecSuccess) {
            throw BMSSecurityError.generalError
        } else {
            return (publicKey!, privateKey!)
        }
    }
    
    private static func getKeyPairBitsFromKeyChain(_ publicTag:String, privateTag:String) throws -> (publicKey: Data, privateKey: Data) {
        return try (getKeyBitsFromKeyChain(publicTag),getKeyBitsFromKeyChain(privateTag))
    }
    
    private static func getKeyPairRefFromKeyChain(_ publicTag:String, privateTag:String) throws -> (publicKey: SecKey, privateKey: SecKey) {
        return try (getKeyRefFromKeyChain(publicTag),getKeyRefFromKeyChain(privateTag))
    }
    
    private static func getKeyRefFromKeyChain(_ tag:String) throws -> SecKey {
        let keyAttr : [NSString:AnyObject] = [
            kSecClass : kSecClassKey,
            kSecAttrApplicationTag: tag as AnyObject,
            kSecAttrKeyType : kSecAttrKeyTypeRSA,
            kSecReturnRef : kCFBooleanTrue
        ]
        var result: AnyObject?
        
        let status = SecItemCopyMatching(keyAttr as CFDictionary, &result)
        
        guard status == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        
        return result as! SecKey
        
    }
    
    internal static func getCertificateFromKeyChain(_ certificateLabel:String) throws -> SecCertificate {
        let getQuery :  [NSString: AnyObject] = [
            kSecClass : kSecClassCertificate,
            kSecReturnRef : true as AnyObject,
            kSecAttrLabel : certificateLabel as AnyObject
        ]
        var result: AnyObject?
        let getStatus = SecItemCopyMatching(getQuery as CFDictionary, &result)
        
        guard getStatus == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        
        return result as! SecCertificate
    }
    
    internal static func getItemFromKeyChain(_ label:String) ->  String? {
        let query: [NSString: AnyObject] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: label as AnyObject,
            kSecReturnData: kCFBooleanTrue
        ]
        var results: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &results)
        if status == errSecSuccess {
            let data = results as! Data
            let password = String(data: data, encoding: String.Encoding.utf8)!
            
            return password
        }
        
        return nil
    }
    
    internal static func signCsr(_ payloadJSON:[String : AnyObject], keyIds ids:(publicKey: String, privateKey: String), keySize: Int) throws -> String {
        do {
            let strPayloadJSON = try Utils.JSONStringify(payloadJSON as AnyObject)
            let keys = try getKeyPairBitsFromKeyChain(ids.publicKey, privateTag: ids.privateKey)
            let publicKey = keys.publicKey
            
            let privateKeySec = try getKeyPairRefFromKeyChain(ids.publicKey, privateTag: ids.privateKey).privateKey
            let strJwsHeaderJSON = try Utils.JSONStringify(getJWSHeaderForPublicKey(publicKey) as AnyObject)
            guard let jwsHeaderData : Data = strJwsHeaderJSON.data(using: String.Encoding.utf8), let payloadJSONData : Data = strPayloadJSON.data(using: String.Encoding.utf8) else {
                throw BMSSecurityError.generalError
            }
            
            let jwsHeaderBase64 = Utils.base64StringFromData(jwsHeaderData, isSafeUrl: true)
            let payloadJSONBase64 = Utils.base64StringFromData(payloadJSONData, isSafeUrl: true)
            
            let jwsHeaderAndPayload = jwsHeaderBase64 + ("." + payloadJSONBase64)
            let signedData = try signData(jwsHeaderAndPayload, privateKey:privateKeySec)
            
            let signedDataBase64 = Utils.base64StringFromData(signedData, isSafeUrl: true)
            
            return jwsHeaderAndPayload + ("." + signedDataBase64)
        }
        catch {
            throw BMSSecurityError.generalError
        }
    }
    
    private static func getJWSHeaderForPublicKey(_ publicKey: Data) throws ->[String:AnyObject]
    {
        let base64Options = NSData.Base64EncodingOptions(rawValue:0)
        
        guard let pkModulus : Data = getPublicKeyMod(publicKey), let pkExponent : Data = getPublicKeyExp(publicKey) else {
            throw BMSSecurityError.generalError
        }
        
        let mod:String = pkModulus.base64EncodedString(options: base64Options)
        
        let exp:String = pkExponent.base64EncodedString(options: base64Options)
        
        let publicKeyJSON : [String:AnyObject] = [
            BMSSecurityConstants.JSON_ALG_KEY : BMSSecurityConstants.JSON_RSA_VALUE as AnyObject,
            BMSSecurityConstants.JSON_MOD_KEY : mod as AnyObject,
            BMSSecurityConstants.JSON_EXP_KEY : exp as AnyObject
        ]
        let jwsHeaderJSON :[String:AnyObject] = [
            BMSSecurityConstants.JSON_ALG_KEY : BMSSecurityConstants.JSON_RS256_VALUE as AnyObject,
            BMSSecurityConstants.JSON_JPK_KEY : publicKeyJSON as AnyObject
        ]
        return jwsHeaderJSON
        
    }
    
    private static func getPublicKeyMod(_ publicKeyBits: Data) -> Data? {
        var iterator : Int = 0
        iterator += 1 // TYPE - bit stream - mod + exp
        derEncodingGetSizeFrom(publicKeyBits, at:&iterator) // Total size
        
        iterator += 1 // TYPE - bit stream mod
        let mod_size : Int = derEncodingGetSizeFrom(publicKeyBits, at:&iterator)
        if(mod_size == -1) {
            return nil
        }
        return publicKeyBits.subdata(in: NSMakeRange(iterator, mod_size).toRange()!)
    }
    
    //Return public key exponent
    private static func getPublicKeyExp(_ publicKeyBits: Data) -> Data? {
        var iterator : Int = 0
        iterator += 1 // TYPE - bit stream - mod + exp
        derEncodingGetSizeFrom(publicKeyBits, at:&iterator) // Total size
        
        iterator += 1// TYPE - bit stream mod
        let mod_size : Int = derEncodingGetSizeFrom(publicKeyBits, at:&iterator)
        iterator += mod_size
        
        iterator += 1 // TYPE - bit stream exp
        let exp_size : Int = derEncodingGetSizeFrom(publicKeyBits, at:&iterator)
        //Ensure we got an exponent size
        if(exp_size == -1) {
            return nil
        }
        return publicKeyBits.subdata(in: NSMakeRange(iterator, exp_size).toRange()!)
    }
    
    private static func derEncodingGetSizeFrom(_ buf : Data, at iterator: inout Int) -> Int{
        
        // Have to cast the pointer to the right size
        //let pointer = UnsafePointer<UInt8>((buf as NSData).bytes)
        //let count = buf.count
        
        // Get our buffer pointer and make an array out of it
        //let buffer = UnsafeBufferPointer<UInt8>(start:pointer, count:count)
        let data = buf//[UInt8](buffer)
        
        var itr : Int = iterator
        var num_bytes :UInt8 = 1
        var ret : Int = 0
        if (data[itr] > 0x80) {
            num_bytes  = data[itr] - 0x80
            itr += 1
        }
        
        for i in 0 ..< Int(num_bytes) {
            ret = (ret * 0x100) + Int(data[itr + i])
        }
        
        iterator = itr + Int(num_bytes)
        
        return ret
    }
    
    private static func signData(_ payload:String, privateKey:SecKey) throws -> Data {
        guard let data:Data = payload.data(using: String.Encoding.utf8) else {
            throw BMSSecurityError.generalError
        }
        
        func doSha256(_ dataIn:Data) throws -> Data {
            var hash = [UInt8](repeating: 0,  count: Int(CC_SHA256_DIGEST_LENGTH))
            dataIn.withUnsafeBytes {
                _ = CC_SHA256($0, CC_LONG(dataIn.count), &hash)
            }
            return Data(bytes: hash)
        }
        
        guard let digest:Data = try? doSha256(data), let signedData: NSMutableData = NSMutableData(length: SecKeyGetBlockSize(privateKey))  else {
            throw BMSSecurityError.generalError
        }
        
        var signedDataLength: Int = signedData.length
        
        let digestBytes: UnsafePointer<UInt8> = ((digest as NSData).bytes).bindMemory(to: UInt8.self, capacity: digest.count)
        let digestlen = digest.count
        let mutableBytes: UnsafeMutablePointer<UInt8> = signedData.mutableBytes.assumingMemoryBound(to: UInt8.self)
        
        let signStatus:OSStatus = SecKeyRawSign(privateKey, SecPadding.PKCS1SHA256, digestBytes, digestlen,
                                                mutableBytes, &signedDataLength)
        
        guard signStatus == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        
        return signedData as Data
    }
    
    internal static func saveItemToKeyChain(_ data:String, label: String) -> Bool{
        guard let stringData = data.data(using: String.Encoding.utf8) else {
            return false
        }
        let key: [NSString: AnyObject] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: label as AnyObject,
            kSecValueData: stringData as AnyObject
        ]
        var status = SecItemAdd(key as CFDictionary, nil)
        if(status != errSecSuccess){
            if(SecurityUtils.removeItemFromKeyChain(label) == true) {
                status = SecItemAdd(key as CFDictionary, nil)
            }
        }
        return status == errSecSuccess
    }
    internal static func removeItemFromKeyChain(_ label: String) -> Bool{
        
        let delQuery : [NSString:AnyObject] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: label as AnyObject
        ]
        
        let delStatus:OSStatus = SecItemDelete(delQuery as CFDictionary)
        return delStatus == errSecSuccess
        
    }
    
    
    internal static func getCertificateFromString(_ stringData:String) throws -> SecCertificate{
        
        if let data:Data = Data(base64Encoded: stringData, options: NSData.Base64DecodingOptions.ignoreUnknownCharacters)  {
            if let certificate = SecCertificateCreateWithData(kCFAllocatorDefault, data as CFData) {
                return certificate
            }
        }
        throw BMSSecurityError.generalError
    }
    
    internal static func deleteCertificateFromKeyChain(_ certificateLabel:String) -> Bool{
        let delQuery : [NSString:AnyObject] = [
            kSecClass: kSecClassCertificate,
            kSecAttrLabel: certificateLabel as AnyObject
        ]
        let delStatus:OSStatus = SecItemDelete(delQuery as CFDictionary)
        
        return delStatus == errSecSuccess
        
    }
    
    private static func deleteKeyFromKeyChain(_ tag:String) -> Bool{
        let delQuery : [NSString:AnyObject] = [
            kSecClass  : kSecClassKey,
            kSecAttrApplicationTag : tag as AnyObject
        ]
        let delStatus:OSStatus = SecItemDelete(delQuery as CFDictionary)
        return delStatus == errSecSuccess
    }
    
    
    internal static func saveCertificateToKeyChain(_ certificate:SecCertificate, certificateLabel:String) throws {
        //make sure certificate is deleted
        deleteCertificateFromKeyChain(certificateLabel)
        //set certificate in key chain
        let setQuery: [NSString: AnyObject] = [
            kSecClass: kSecClassCertificate,
            kSecValueRef: certificate,
            kSecAttrLabel: certificateLabel as AnyObject,
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            ]
        let addStatus:OSStatus = SecItemAdd(setQuery as CFDictionary, nil)
        
        guard addStatus == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
    }
    internal static func checkCertificatePublicKeyValidity(_ certificate:SecCertificate, publicKeyTag:String) throws -> Bool{
        
        let certificatePublicKeyTag = "checkCertificatePublicKeyValidity : publicKeyFromCertificate"
        var publicKeyBits = try getKeyBitsFromKeyChain(publicKeyTag)
        let policy = SecPolicyCreateBasicX509()
        var trust: SecTrust?
        var status = SecTrustCreateWithCertificates(certificate, policy, &trust)
        if let unWrappedTrust = trust, status == errSecSuccess {
            if let certificatePublicKey = SecTrustCopyPublicKey(unWrappedTrust)  {
                defer {
                    SecurityUtils.deleteKeyFromKeyChain(certificatePublicKeyTag)
                }
                try savePublicKeyToKeyChain(certificatePublicKey, tag: certificatePublicKeyTag)
                let ceritificatePublicKeyBits = try getKeyBitsFromKeyChain(certificatePublicKeyTag)
                
                if(ceritificatePublicKeyBits == publicKeyBits){
                    return true
                }
            }
        }
        throw BMSSecurityError.generalError
    }
    
    internal static func clearDictValuesFromKeyChain(_ dict : [String : NSString])  {
        for (tag, kSecClassName) in dict {
            if kSecClassName == kSecClassCertificate {
                deleteCertificateFromKeyChain(tag)
            } else if kSecClassName == kSecClassKey {
                deleteKeyFromKeyChain(tag)
            } else if kSecClassName == kSecClassGenericPassword {
                removeItemFromKeyChain(tag)
            }
        }
    }
}

#else
    
internal class SecurityUtils {
    
    fileprivate static func savePublicKeyToKeyChain(_ key:SecKey,tag:String) throws {
        let publicKeyAttr : [NSString:AnyObject] = [
            kSecValueRef: key,
            kSecAttrIsPermanent : true,
            kSecAttrApplicationTag : tag,
            kSecAttrKeyClass : kSecAttrKeyClassPublic
            
        ]
        let addStatus:OSStatus = SecItemAdd(publicKeyAttr, nil)
        guard addStatus == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        
        
    }
    fileprivate static func getKeyBitsFromKeyChain(_ tag:String) throws -> Data {
        let keyAttr : [NSString:AnyObject] = [
            kSecClass : kSecClassKey,
            kSecAttrApplicationTag: tag,
            kSecAttrKeyType : kSecAttrKeyTypeRSA,
            kSecReturnData : true
        ]
        var result: AnyObject?
        
        let status = SecItemCopyMatching(keyAttr, &result)
        
        guard status == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        return result as! Data
        
    }
    
    internal static func generateKeyPair(_ keySize:Int, publicTag:String, privateTag:String)throws -> (publicKey: SecKey, privateKey: SecKey) {
        //make sure keys are deleted
        SecurityUtils.deleteKeyFromKeyChain(publicTag)
        SecurityUtils.deleteKeyFromKeyChain(privateTag)
        
        var status:OSStatus = noErr
        var privateKey:SecKey?
        var publicKey:SecKey?
        
        let privateKeyAttr : [NSString:AnyObject] = [
            kSecAttrIsPermanent : true,
            kSecAttrApplicationTag : privateTag,
            kSecAttrKeyClass : kSecAttrKeyClassPrivate
        ]
        
        let publicKeyAttr : [NSString:AnyObject] = [
            kSecAttrIsPermanent : true,
            kSecAttrApplicationTag : publicTag,
            kSecAttrKeyClass : kSecAttrKeyClassPublic,
            ]
        
        let keyPairAttr : [NSString:AnyObject] = [
            kSecAttrKeyType : kSecAttrKeyTypeRSA,
            kSecAttrKeySizeInBits : keySize,
            kSecPublicKeyAttrs : publicKeyAttr,
            kSecPrivateKeyAttrs : privateKeyAttr
        ]
        
        status = SecKeyGeneratePair(keyPairAttr, &publicKey, &privateKey)
        if (status != errSecSuccess) {
            throw BMSSecurityError.generalError
        } else {
            return (publicKey!, privateKey!)
        }
    }
    
    fileprivate static func getKeyPairBitsFromKeyChain(_ publicTag:String, privateTag:String) throws -> (publicKey: Data, privateKey: Data) {
        return try (getKeyBitsFromKeyChain(publicTag),getKeyBitsFromKeyChain(privateTag))
    }
    
    fileprivate static func getKeyPairRefFromKeyChain(_ publicTag:String, privateTag:String) throws -> (publicKey: SecKey, privateKey: SecKey) {
        return try (getKeyRefFromKeyChain(publicTag),getKeyRefFromKeyChain(privateTag))
    }
    
    fileprivate static func getKeyRefFromKeyChain(_ tag:String) throws -> SecKey {
        let keyAttr : [NSString:AnyObject] = [
            kSecClass : kSecClassKey,
            kSecAttrApplicationTag: tag,
            kSecAttrKeyType : kSecAttrKeyTypeRSA,
            kSecReturnRef : kCFBooleanTrue
        ]
        var result: AnyObject?
        
        let status = SecItemCopyMatching(keyAttr, &result)
        
        guard status == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        
        return result as! SecKey
        
    }
    
    internal static func getCertificateFromKeyChain(_ certificateLabel:String) throws -> SecCertificate {
        let getQuery :  [NSString: AnyObject] = [
            kSecClass : kSecClassCertificate,
            kSecReturnRef : true,
            kSecAttrLabel : certificateLabel
        ]
        var result: AnyObject?
        let getStatus = SecItemCopyMatching(getQuery, &result)
        
        guard getStatus == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        
        return result as! SecCertificate
    }
    
    internal static func getItemFromKeyChain(_ label:String) ->  String? {
        let query: [NSString: AnyObject] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: label,
            kSecReturnData: kCFBooleanTrue
        ]
        var results: AnyObject?
        let status = SecItemCopyMatching(query, &results)
        if status == errSecSuccess {
            let data = results as! Data
            let password = String(data: data, encoding: String.Encoding.utf8)!
            
            return password
        }
        
        return nil
    }
    
    internal static func signCsr(_ payloadJSON:[String : AnyObject], keyIds ids:(publicKey: String, privateKey: String), keySize: Int) throws -> String {
        do {
            let strPayloadJSON = try Utils.JSONStringify(payloadJSON)
            let keys = try getKeyPairBitsFromKeyChain(ids.publicKey, privateTag: ids.privateKey)
            let publicKey = keys.publicKey
            
            let privateKeySec = try getKeyPairRefFromKeyChain(ids.publicKey, privateTag: ids.privateKey).privateKey
            let strJwsHeaderJSON = try Utils.JSONStringify(getJWSHeaderForPublicKey(publicKey))
            guard let jwsHeaderData : Data = strJwsHeaderJSON.data(using: String.Encoding.utf8), payloadJSONData : Data = strPayloadJSON.data(using: String.Encoding.utf8) else {
                throw BMSSecurityError.generalError
            }
            
            let jwsHeaderBase64 = Utils.base64StringFromData(jwsHeaderData, isSafeUrl: true)
            let payloadJSONBase64 = Utils.base64StringFromData(payloadJSONData, isSafeUrl: true)
            
            let jwsHeaderAndPayload = jwsHeaderBase64 + ("." + payloadJSONBase64)
            let signedData = try signData(jwsHeaderAndPayload, privateKey:privateKeySec)
            
            let signedDataBase64 = Utils.base64StringFromData(signedData, isSafeUrl: true)
            
            return jwsHeaderAndPayload + ("." + signedDataBase64)
        }
        catch {
            throw BMSSecurityError.generalError
        }
    }
    
    fileprivate static func getJWSHeaderForPublicKey(_ publicKey: Data) throws ->[String:AnyObject]
    {
        let base64Options = NSData.Base64EncodingOptions(rawValue:0)
        
        guard let pkModulus : Data = getPublicKeyMod(publicKey), let pkExponent : Data = getPublicKeyExp(publicKey) else {
            throw BMSSecurityError.generalError
        }
        
        let mod:String = pkModulus.base64EncodedString(options: base64Options)
        
        let exp:String = pkExponent.base64EncodedString(options: base64Options)
        
        let publicKeyJSON : [String:AnyObject] = [
            BMSSecurityConstants.JSON_ALG_KEY : BMSSecurityConstants.JSON_RSA_VALUE,
            BMSSecurityConstants.JSON_MOD_KEY : mod,
            BMSSecurityConstants.JSON_EXP_KEY : exp
        ]
        let jwsHeaderJSON :[String:AnyObject] = [
            BMSSecurityConstants.JSON_ALG_KEY : BMSSecurityConstants.JSON_RS256_VALUE,
            BMSSecurityConstants.JSON_JPK_KEY : publicKeyJSON
        ]
        return jwsHeaderJSON
        
    }
    
    fileprivate static func getPublicKeyMod(_ publicKeyBits: Data) -> Data? {
        var iterator : Int = 0
        iterator+=1 // TYPE - bit stream - mod + exp
        derEncodingGetSizeFrom(publicKeyBits, at:&iterator) // Total size
        
        iterator+=1 // TYPE - bit stream mod
        let mod_size : Int = derEncodingGetSizeFrom(publicKeyBits, at:&iterator)
        if(mod_size == -1) {
            return nil
        }
        return publicKeyBits.subdata(with: NSMakeRange(iterator, mod_size))
    }
    
    //Return public key exponent
    fileprivate static func getPublicKeyExp(_ publicKeyBits: Data) -> Data? {
        var iterator : Int = 0
        iterator+=1 // TYPE - bit stream - mod + exp
        derEncodingGetSizeFrom(publicKeyBits, at:&iterator) // Total size
        
        iterator+=1// TYPE - bit stream mod
        let mod_size : Int = derEncodingGetSizeFrom(publicKeyBits, at:&iterator)
        iterator += mod_size
        
        iterator+=1 // TYPE - bit stream exp
        let exp_size : Int = derEncodingGetSizeFrom(publicKeyBits, at:&iterator)
        //Ensure we got an exponent size
        if(exp_size == -1) {
            return nil
        }
        return publicKeyBits.subdata(with: NSMakeRange(iterator, exp_size))
    }
    
    fileprivate static func derEncodingGetSizeFrom(_ buf : Data, at iterator: inout Int) -> Int{
        
        // Have to cast the pointer to the right size
        let pointer = (buf as NSData).bytes.bindMemory(to: UInt8.self, capacity: buf.count)
        let count = buf.count
        
        // Get our buffer pointer and make an array out of it
        let buffer = UnsafeBufferPointer<UInt8>(start:pointer, count:count)
        let data = [UInt8](buffer)
        
        var itr : Int = iterator
        var num_bytes :UInt8 = 1
        var ret : Int = 0
        if (data[itr] > 0x80) {
            num_bytes  = data[itr] - 0x80
            itr += 1
        }
        
        for i in 0 ..< Int(num_bytes) {
            ret = (ret * 0x100) + Int(data[itr + i])
        }
        
        iterator = itr + Int(num_bytes)
        
        return ret
    }
    
    fileprivate static func signData(_ payload:String, privateKey:SecKey) throws -> Data {
        guard let data:Data = payload.data(using: String.Encoding.utf8) else {
            throw BMSSecurityError.generalError
        }
        
        func doSha256(_ dataIn:Data) throws -> Data {
            
            guard let shaOut: NSMutableData = NSMutableData(length: Int(CC_SHA256_DIGEST_LENGTH)) else {
                throw BMSSecurityError.generalError
            }
            
            CC_SHA256((dataIn as NSData).bytes, CC_LONG(dataIn.count), UnsafeMutablePointer<UInt8>(shaOut.mutableBytes))
            
            return shaOut
        }
        
        guard let digest:Data = try? doSha256(data), signedData: NSMutableData = NSMutableData(length: SecKeyGetBlockSize(privateKey))  else {
            throw BMSSecurityError.generalError
        }
        
        var signedDataLength: Int = signedData.length
        
        let digestBytes = (digest as NSData).bytes.bindMemory(to: UInt8.self, capacity: digest.count)
        let digestlen = digest.count
        
        let signStatus:OSStatus = SecKeyRawSign(privateKey, SecPadding.PKCS1SHA256, digestBytes, digestlen, UnsafeMutablePointer<UInt8>(signedData.mutableBytes),
                                                &signedDataLength)
        
        guard signStatus == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
        
        return signedData
    }
    
    internal static func saveItemToKeyChain(_ data:String, label: String) -> Bool{
        guard let stringData = data.data(using: String.Encoding.utf8) else {
            return false
        }
        let key: [NSString: AnyObject] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: label,
            kSecValueData: stringData
        ]
        var status = SecItemAdd(key, nil)
        if(status != errSecSuccess){
            if(SecurityUtils.removeItemFromKeyChain(label) == true) {
                status = SecItemAdd(key, nil)
            }
        }
        return status == errSecSuccess
    }
    internal static func removeItemFromKeyChain(_ label: String) -> Bool{
        
        let delQuery : [NSString:AnyObject] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: label
        ]
        
        let delStatus:OSStatus = SecItemDelete(delQuery)
        return delStatus == errSecSuccess
        
    }
    
    
    internal static func getCertificateFromString(_ stringData:String) throws -> SecCertificate{
        
        if let data:Data = Data(base64Encoded: stringData, options: NSData.Base64DecodingOptions.ignoreUnknownCharacters)  {
            if let certificate = SecCertificateCreateWithData(kCFAllocatorDefault, data) {
                return certificate
            }
        }
        throw BMSSecurityError.generalError
    }
    
    internal static func deleteCertificateFromKeyChain(_ certificateLabel:String) -> Bool{
        let delQuery : [NSString:AnyObject] = [
            kSecClass: kSecClassCertificate,
            kSecAttrLabel: certificateLabel
        ]
        let delStatus:OSStatus = SecItemDelete(delQuery)
        
        return delStatus == errSecSuccess
        
    }
    
    fileprivate static func deleteKeyFromKeyChain(_ tag:String) -> Bool{
        let delQuery : [NSString:AnyObject] = [
            kSecClass  : kSecClassKey,
            kSecAttrApplicationTag : tag
        ]
        let delStatus:OSStatus = SecItemDelete(delQuery)
        return delStatus == errSecSuccess
    }
    
    
    internal static func saveCertificateToKeyChain(_ certificate:SecCertificate, certificateLabel:String) throws {
        //make sure certificate is deleted
        deleteCertificateFromKeyChain(certificateLabel)
        //set certificate in key chain
        let setQuery: [NSString: AnyObject] = [
            kSecClass: kSecClassCertificate,
            kSecValueRef: certificate,
            kSecAttrLabel: certificateLabel,
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            ]
        let addStatus:OSStatus = SecItemAdd(setQuery, nil)
        
        guard addStatus == errSecSuccess else {
            throw BMSSecurityError.generalError
        }
    }
    internal static func checkCertificatePublicKeyValidity(_ certificate:SecCertificate, publicKeyTag:String) throws -> Bool{
        
        let certificatePublicKeyTag = "checkCertificatePublicKeyValidity : publicKeyFromCertificate"
        var publicKeyBits = try getKeyBitsFromKeyChain(publicKeyTag)
        let policy = SecPolicyCreateBasicX509()
        var trust: SecTrust?
        var status = SecTrustCreateWithCertificates(certificate, policy, &trust)
        if let unWrappedTrust = trust where status == errSecSuccess {
            if let certificatePublicKey = SecTrustCopyPublicKey(unWrappedTrust)  {
                defer {
                    SecurityUtils.deleteKeyFromKeyChain(certificatePublicKeyTag)
                }
                try savePublicKeyToKeyChain(certificatePublicKey, tag: certificatePublicKeyTag)
                let ceritificatePublicKeyBits = try getKeyBitsFromKeyChain(certificatePublicKeyTag)
                
                if(ceritificatePublicKeyBits == publicKeyBits){
                    return true
                }
            }
        }
        throw BMSSecurityError.generalError
    }
    
    internal static func clearDictValuesFromKeyChain(_ dict : [String : NSString])  {
        for (tag, kSecClassName) in dict {
            if kSecClassName == kSecClassCertificate {
                deleteCertificateFromKeyChain(tag)
            } else if kSecClassName == kSecClassKey {
                deleteKeyFromKeyChain(tag)
            } else if kSecClassName == kSecClassGenericPassword {
                removeItemFromKeyChain(tag)
            }
        }
    }
}
    
#endif
