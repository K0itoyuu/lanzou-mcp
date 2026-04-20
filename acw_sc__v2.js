var arg1 = '696E38613C462C5728B190D4E08DE2ADF4928C88';

(function() {
    // 1. 映射重排表
    var permutation = [0xf, 0x23, 0x1d, 0x18, 0x21, 0x10, 0x1, 0x26, 0xa, 0x9, 0x13, 0x1f, 0x28, 0x1b, 0x16, 0x17, 0x19, 0xd, 0x6, 0xb, 0x27, 0x12, 0x14, 0x8, 0xe, 0x15, 0x20, 0x1a, 0x2, 0x1e, 0x7, 0x4, 0x11, 0x5, 0x3, 0x1c, 0x22, 0x25, 0xc, 0x24];
    
    // 2. 解密密钥 (原代码中通过自定义 Base64 解码器动态获取，已还原)
    var key = '3000176000856006061501533003690027800375';
    
    var reordered = [];
    var permutedStr = '';
    var resultHex = '';
    var len = arg1.length;

    // 3. 按照 permutation 表对 arg1 进行字符重排
    for (var i = 0; i < len; i++) {
        for (var j = 0; j < permutation.length; j++) {
            if (permutation[j] === i + 1) {
                reordered[j] = arg1[i];
                break;
            }
        }
    }
    permutedStr = reordered.join('');

    // 4. 与密钥进行逐字节异或 (XOR) 运算
    for (var i = 0; i < permutedStr.length && i < key.length; i += 2) {
        var byte1 = parseInt(permutedStr.substring(i, i + 2), 16);
        var byte2 = parseInt(key.substring(i, i + 2), 16);
        var xorVal = byte1 ^ byte2;
        var hexByte = xorVal.toString(16);
        if (hexByte.length === 1) hexByte = '0' + hexByte; // 补齐两位
        resultHex += hexByte;
    }

    // 5. 写入 Cookie 并刷新页面
    // 0x36ee80 = 3600000 毫秒 (1小时)
    var expires = new Date(Date.now() + 0x36ee80).toUTCString();
    document.cookie = 'acw_sc__v2=' + resultHex + '; path=/; expires=' + expires;
})();