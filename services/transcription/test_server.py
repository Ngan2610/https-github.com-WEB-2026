import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from server import Handler, input_path, InputError

class TranscriptionTests(unittest.TestCase):
    def test_paths_cannot_escape_upload_root_including_symlinks(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as other:
            inside=Path(root)/"a.mp4";inside.write_bytes(b"video")
            outside=Path(other)/"secret";outside.write_text("private")
            link=Path(root)/"link";link.symlink_to(outside)
            self.assertEqual(input_path(str(inside),root),inside)
            for p in [outside,link]:
                with self.assertRaises(InputError) as error:input_path(str(p),root)
                self.assertEqual(error.exception.status,403)

    def test_http_auth_validation_and_inference_contract(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ,{"UPLOAD_DIR":root,"TRANSCRIPTION_INTERNAL_TOKEN":"private-test-token"}):
            file=Path(root)/"source.bin";file.write_bytes(b"video")
            server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            base=f"http://127.0.0.1:{server.server_port}"
            def request(payload,token="private-test-token"):
                req=urllib.request.Request(base+'/transcribe',data=json.dumps(payload).encode(),
                    headers={"Content-Type":"application/json","X-Internal-Token":token})
                try:
                    with urllib.request.urlopen(req) as response:return response.status,json.load(response)
                except urllib.error.HTTPError as err:return err.code,json.load(err)
            try:
                self.assertEqual(request({},"wrong")[0],401)
                self.assertEqual(request({"sourceVideoPath":str(file),"language":"ru"})[0],422)
                expected={"language":"en","segments":[{"text":"Add salt","start":0,"end":2}]}
                with patch('server.recognize',return_value=expected) as engine:
                    status,body=request({"sourceVideoPath":str(file),"language":"auto"})
                    self.assertEqual(status,200);self.assertEqual(body,expected)
                    self.assertEqual(engine.call_args.args[1],'auto')
            finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
