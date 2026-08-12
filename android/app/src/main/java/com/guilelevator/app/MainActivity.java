package com.guilelevator.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.GeolocationPermissions;
import android.webkit.URLUtil;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

// 출퇴근 체크가 navigator.geolocation(순수 웹 API)을 쓰는데, 안드로이드 WebView는 기본적으로
// 이 요청을 네이티브 위치 권한과 연결해주지 않는다 — 여기서 직접 연결한다.
// Capacitor 자체 파일선택(사진 업로드) 기능이 깨지지 않도록 BridgeWebChromeClient를 상속해서
// 위치 권한 콜백만 추가한다(완전히 새 WebChromeClient로 교체하지 않음).
public class MainActivity extends BridgeActivity {
    private static final int LOCATION_PERMISSION_REQUEST = 9001;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                    return;
                }
                pendingGeoCallback = callback;
                pendingGeoOrigin = origin;
                ActivityCompat.requestPermissions(
                        MainActivity.this,
                        new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                        LOCATION_PERMISSION_REQUEST
                );
            }
        });

        // 웹뷰는 blob: URL 다운로드를 받아줄 다운로드 매니저가 기본적으로 없다 — 사진(다운로드
        // 전용 URL, lib/photos.js가 ?download= 붙여서 연결)을 눌렀을 때 이 리스너가 대신
        // 안드로이드 DownloadManager로 넘겨서 앱을 벗어나지 않고 바로 다운로드되게 한다.
        // Content-Disposition: attachment로 응답하는 URL(Supabase Storage의 ?download 파라미터)만
        // 이 리스너가 걸린다 — 이미지처럼 웹뷰가 직접 렌더링 가능한 응답은 안 걸린다.
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.addRequestHeader("User-Agent", userAgent);
                request.setMimeType(mimetype);
                request.setTitle(filename);
                request.setDescription("구일엘리베이터 앱 다운로드");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (dm != null) dm.enqueue(request);
            } catch (Exception e) {
                // 다운로드 실패해도 앱 자체는 계속 동작해야 한다 — 조용히 무시.
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST && pendingGeoCallback != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }
}
