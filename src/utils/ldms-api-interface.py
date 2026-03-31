from authlib.integrations.requests_client import OAuth2Session
from authlib.oauth2.rfc7523 import PrivateKeyJWT
from requests.exceptions import HTTPError

import pandas as pd
import io
import time
import json

from dataclasses import dataclass,asdict
from typing import Optional,Union, Annotated, List
from datetime import datetime

token_url = "https://oidc.nersc.gov/c2id/token"
server_url = "https://perfmon.nersc.gov/api/v1"

debug=0

@dataclass
class RetClass:
    return_type : str #success | error
    context: str #None for error
    data: any #df for data query
    data_length:any
    error: any

@dataclass
class UserDefinedSlice:
    user_nodeslice: List[str]
    user_start_time: datetime 
    user_end_time: datetime 

def get_session(client_id, private_key):
    session = OAuth2Session(
        client_id, 
        private_key, 
        PrivateKeyJWT(token_url),
        grant_type="client_credentials",
        token_endpoint=token_url
    )
    return session

def get_metric_list(session):
    try:
        response=session.get(server_url+"/list_metrics")
        response.raise_for_status()
        return response.json()
    except HTTPError as http_err:
        print(f"HTTP error occurred") 
        return response.json()
    except Exception as err:
        print(f"error: {err}")

def get_power_metric_list(session):
    try:
        response=session.get(server_url+"/list_power_metrics")
        response.raise_for_status()
        return response.json()
    except HTTPError as http_err:
        print(f"HTTP error occurred") 
        return response.json()
    except Exception as err:
        print(f"error: {err}")

def fetch_job_metadata(session,userid,jobid,machine_id):
    post_data = {
        "userid" : userid,
        "jobid" : jobid,
        "machineid" : machine_id,
    }
    url=server_url+"/fetch_job_metadata"
    try:
        response=session.post(url,json=post_data)
        response.raise_for_status()
        return response.json()
    except HTTPError as http_err:
        print(f"HTTP error occurred {http_err}")
        try:
            print("Details:", response.json())
        except:
            print("No details provided.")
    except Exception as err:
        print(f"error: {err}")

    


    
def fetch_generic(session,nodelist_list,start_time_list,end_time_list,sampler_metrics_list,fmt,cols,estimate_number_samples_without_fetching_data=False,aggr_func=None,timewindow=0,timewindow_unit="s"):
    post_data = {
        "nodelist_list" : nodelist_list,
        "sampler_metrics_list" : sampler_metrics_list,
        "start_time_list" : start_time_list,
        "end_time_list" : end_time_list,
        "fmt" : fmt,
        "cols": cols,
        "estimate_num_samples_without_fetching_data" : estimate_number_samples_without_fetching_data
    }
    url=server_url+"/fetch_generic"
    if aggr_func:
        url += f"?aggr_func={aggr_func}&timewindow={timewindow}&timewindow_unit={timewindow_unit}"
    try:
        response=session.post(url,json=post_data)
        response.raise_for_status()
        return response.json()
    except HTTPError as http_err:
        print(f"HTTP error occurred {http_err}") 
    except Exception as err:
        print(f"error: {err}")

def roofline(session,userid,jobid,machine_id):
    metrics_list = [
        "nersc_ldms_dcgm_dram_active",
        "nersc_ldms_dcgm_fp16_active",
        "nersc_ldms_dcgm_fp32_active",
        "nersc_ldms_dcgm_fp64_active",
        "nersc_ldms_dcgm_tensor_active"
    ]
    response=fetch_metrics(session,userid ,jobid,machine_id,metrics_list)
    print(response)
    df=get_dataframe(session,response['task_id'],offset=0,size=0)
    if df is None:
        print("error in estimating roofline stats - probably lack of sufficient data")
        return None
    
    peak_fp16 = 78
    peak_fp32 = 19.5 
    peak_fp64 = 9.7
    peak_tensor_fp64 = 19.5
    peak_mem_bw_a100 = 1.555 

    #filter values where all fp and tensor active is zero - probably invalid
    filtered_df = df[(df[metrics_list] != 0).any(axis=1)]
    flops_fp16 = peak_fp16*filtered_df['gpu_dcgm_fp16_active'].mean()
    flops_fp32 = peak_fp32*filtered_df['gpu_dcgm_fp32_active'].mean()
    flops_fp64 = peak_fp64*filtered_df['gpu_dcgm_fp64_active'].mean() #+ peak_tensor_fp64*filtered_df['gpu_dcgm_tensor_active'].mean()
    
    flopbyte = peak_mem_bw_a100*filtered_df['gpu_dcgm_dram_active'].mean()
    
    ai_estimate_64 = flops_fp64 / flopbyte 
    ai_estimate_32 = flops_fp32 / flopbyte 
    ai_estimate_16 = flops_fp16 / flopbyte 
    print((ai_estimate_64,flops_fp64),(ai_estimate_32,flops_fp32),(ai_estimate_16,flops_fp16))
    return ((ai_estimate_64,flops_fp64),(ai_estimate_32,flops_fp32),(ai_estimate_16,flops_fp16))

def fetch_power_metrics(session,userid,jobid,machine_id,metric,estimate_number_samples_without_fetching_data=False,aggr_func="raw",timewindow=15,timewindow_unit="s",user_defined_slices=None):
    aggr_func_input = {
        "aggr_func" : aggr_func,
        "timewindow": timewindow,
        "timewindow_unit" : timewindow_unit
    }
    post_data = {
        "userid" : userid,
        "jobid" : jobid,
        "machineid" : machine_id,
        "metric" : metric,
        "estimate_num_samples_without_fetching_data" : estimate_number_samples_without_fetching_data,
        "user_defined_slices" : user_defined_slices,
        "aggr_func_input" : aggr_func_input
    }
    print(user_defined_slices)
    url=server_url+"/fetch_power_metrics"
    #if aggr_func:
    #    url += f"?aggr_func={aggr_func}&timewindow={timewindow}&timewindow_unit={timewindow_unit}"
    
    #if user_defined_slices:
    #    post_data['user_defined_slices'] = [ asdict(user_defined_slice) for user_defined_slice in user_defined_slices ]
    
    try:
        response=session.post(url,json=post_data)
        response.raise_for_status()
        return response.json()
    except HTTPError as http_err:
        print(f"HTTP error occurred {http_err}")
        try:
            print("Details:", response.json())
        except:
            print("No details provided.")
    except Exception as err:
        print(f"error: {err}")

def fetch_metrics(session,userid,jobid,machine_id,metrics_list,estimate_number_samples_without_fetching_data=False,aggr_func="raw",timewindow=15,timewindow_unit="s",user_defined_slices=None):
    aggr_func_input = {
        "aggr_func" : aggr_func,
        "timewindow": timewindow,
        "timewindow_unit" : timewindow_unit
    }
    post_data = {
        "userid" : userid,
        "jobid" : jobid,
        "machineid" : machine_id,
        "metrics_list" : metrics_list,
        "estimate_num_samples_without_fetching_data" : estimate_number_samples_without_fetching_data,
        "user_defined_slices" : user_defined_slices,
        "aggr_func_input" : aggr_func_input
    }
    url=server_url+"/fetch_metrics"
    #if aggr_func:
    #    url += f"?aggr_func={aggr_func}&timewindow={timewindow}&timewindow_unit={timewindow_unit}"
    try:
        response=session.post(url,json=post_data)
        response.raise_for_status()
        return response.json()
    except HTTPError as http_err:
        print(f"HTTP error occurred {http_err}")
        try:
            print("Details:", response.json())
        except:
            print("No details provided.")
    except Exception as err:
        print(f"error: {err}")

def poll(target,success_condition,failure_condition,retries,interval,*args,**kwargs):
    tries=0
    while tries<retries:
        response=target(*args,**kwargs)
        if debug:
            print(response.content)
            print(response.json())
        if success_condition(response):
            return 'success',response
        elif failure_condition(response):
            print('failure')
            return 'failure',response
        else:
            print(response.json().get('task_status'))
            time.sleep(interval)
            tries+=1
    return 'front end timed out, do you have the right task-id?',response

def get_fetched_dataframe_total_numrows(session,taskid,retries=30,interval=10):
    url=server_url+"/tasks/"+taskid+"/numrows"
    status,response = poll(
        session.get,
        lambda r: r.json()['task_status']=='SUCCESS', #SUCCESS is celery code
        lambda r: r.json()['task_status']=='FAILURE', #FAILURE is celery code
        retries,
        interval,
        (url)
    )
    
    if status == 'success':
        return int(response.json().get('task_result'))
    else:
        print(response.json())
        raise ValueError(status)

def get_dataframe(session,taskid,offset=0,size=0,retries=30,interval=5):
    ret = get_result(session,taskid,offset=offset,size=size,retries=retries,interval=interval)
    if ret.return_type=="success":
        if ret.context!="query data":
            print(f"Received incorrect context {ret.context} : the taskid does not correspond to a data fetch query")
            return None
        if ret.data is not None:
            #if debug:
            #    print(ret.data)
            return ret.data,ret.data_length
    else:
        print(ret.return_type,ret.context,ret.error)
        if debug:
            print(ret.data)
        return None

def get_job_metadata(session,taskid):
    ret = get_result(session,taskid)
    if ret.return_type=="success": 
        if ret.context!="job metadata":
            print(f"Received incorrect context {ret.context} : the taskid does not correspond to a job metadata query")
            return None
        if ret.data is not None:
            return ret.data
        else:
            print("No job metadata received - empty data field")
            return None
    else:
        print(ret)
        return None

def get_exepected_dataframe_numsamples(session,taskid,offset=0,size=0,retries=30,interval=5):
    ret = get_result(session,taskid,offset=offset,size=size,retries=retries,interval=interval)
    
    if ret.return_type=="success": 
        if ret.context!="estimate query size without fetching":
            print(f"Received incorrect context {ret.context} : the taskid does not correspond to a sample size estimation query")
            return None
        if ret.data is not None:
            return ret.data
        else:
            print("No sample size estimation received - empty data field")
            return None
    else:
        print(ret)
        return None

def get_result(session,taskid,offset=0,size=0,retries=30,interval=5):
    url=server_url+"/tasks/"+taskid+f"?offset={offset}&size={size}"
    status,response = poll(
        session.get,
        lambda r: r.json()['task_status']=='SUCCESS', #SUCCESS is celery code
        lambda r: r.json()['task_status']=='FAILURE' or r.json()['task_status']=='UNKNOWN', #FAILURE is celery code
        retries,
        interval,
        (url)
    )
    if status == 'success':
        #post processing for internal errors not due to celery failures
        resp = response.json()
        #print(resp)
        result= resp.get('task_result')
        if result.get('result_status')=="error":
            print(f"Error - {result.get('error')}")
            return RetClass(return_type="error",context=None,data=None,data_length=None,error=result.get('error'))
        else:
            if result.get('result_context') == "estimate query size without fetching":
                return RetClass(return_type="success",context=result.get('result_context'),data=result.get('data'),data_length=None,error=None)
            elif result.get('result_context') == "query data":
                df=pd.read_json(io.StringIO(result.get('data')),orient='records',lines=True)
                df.reset_index(inplace=True)
                return RetClass(return_type="success",context=result.get('result_context'),data=df,data_length=result.get('data_length'),error=None)
            elif result.get('result_context')=="job metadata":
                return RetClass(return_type="success",context=result.get('result_context'),data=result.get('data'),data_length=None,error=None)
            else:
                return RetClass(return_type="error", context=None,data=None,data_length=None,error="context not yet implemented in client")

    else:
        return RetClass(return_type="error", context=None,data=None,data_length=None, error=f"task {taskid} failed at server: {response.json()}")
